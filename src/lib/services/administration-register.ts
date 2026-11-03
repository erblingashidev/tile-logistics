import { and, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import { getControlPlaneDb } from "@/lib/db";
import {
  adminRegisterAuditLog,
  adminRegisterEditRequests,
  adminRegisterSessions,
  adminRegisterTransactions,
  admins,
  employees,
} from "@/lib/db/schema";
import { formatRegisterAuditLogMessage } from "@/lib/log-messages";
import type { SessionUser } from "@/lib/auth/session";
import {
  isAdminPaymentMethod,
  isAdminTransactionKind,
  type AdminPaymentMethod,
  type AdminTransactionKind,
} from "@/lib/administration/constants";
import { sessionHasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { isCashierStaff } from "@/lib/employee-categories";
import { transactionAffectsCashDrawer } from "@/lib/administration/register-cash";
import {
  assertPaymentIncomeRequiredFields,
  assertRegisterInvoiceReference,
  assertSalesAgentRequired,
  invoiceReferencesMatch,
  isIncomeLikeRegisterKind,
  parsePositiveAmountCents,
} from "@/lib/administration/validation";
import { getOrderByInvoiceNumber } from "@/lib/services/orders";
import { getEmployee } from "@/lib/services/employees";
import { getAdministrationSettings } from "@/lib/services/administration-settings";

export type RegisterSessionRow = typeof adminRegisterSessions.$inferSelect;
export type RegisterTransactionRow = typeof adminRegisterTransactions.$inferSelect;

function nowIso() {
  return new Date().toISOString();
}

function signedAmountCents(kind: AdminTransactionKind, amountCents: number) {
  const abs = parsePositiveAmountCents(Math.abs(Math.round(amountCents)));
  if (kind === "expense" || kind === "return_refund") return -abs;
  return abs;
}

async function assertNoDuplicatePaymentInvoice(
  organizationId: number,
  kind: string,
  invoiceReference: string | null | undefined,
  excludeTransactionId?: number
) {
  if (kind !== "payment") return;
  const ref = invoiceReference?.trim();
  if (!ref) return;
  const db = await getControlPlaneDb();
  const candidates = await db
    .select({
      id: adminRegisterTransactions.id,
      invoiceReference: adminRegisterTransactions.invoiceReference,
    })
    .from(adminRegisterTransactions)
    .where(
      and(
        eq(adminRegisterTransactions.organizationId, organizationId),
        eq(adminRegisterTransactions.kind, "payment")
      )
    )
    .limit(200);
  const duplicate = candidates.find(
    (row) =>
      row.id !== excludeTransactionId &&
      invoiceReferencesMatch(row.invoiceReference, ref)
  );
  if (duplicate) {
    throw new Error(
      `A payment for invoice “${ref}” is already recorded (entry #${duplicate.id}). Edit that line instead of creating a duplicate.`
    );
  }
}

function likeSearchPattern(query: string) {
  const sanitized = query.trim().replace(/[%_]/g, " ");
  return `%${sanitized}%`;
}

export async function appendRegisterAudit(
  organizationId: number,
  action: string,
  entityType: string,
  entityId: number | null,
  payload: unknown,
  session: SessionUser,
  ipAddress?: string | null
) {
  const db = await getControlPlaneDb();
  await db.insert(adminRegisterAuditLog).values({
    organizationId,
    action,
    entityType,
    entityId: entityId ?? undefined,
    payloadJson: payload ? JSON.stringify(payload) : null,
    actorEmployeeId:
      session.role === "employee" ? session.employeeId : undefined,
    actorAdminId: session.role === "admin" ? session.adminId : undefined,
    ipAddress: ipAddress ?? null,
    createdAt: nowIso(),
  });
}

export async function getOpenRegisterSession(organizationId: number) {
  const db = await getControlPlaneDb();
  const rows = await db
    .select()
    .from(adminRegisterSessions)
    .where(
      and(
        eq(adminRegisterSessions.organizationId, organizationId),
        eq(adminRegisterSessions.status, "open")
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function openRegisterSession(
  organizationId: number,
  session: SessionUser,
  openingFloatCents: number
) {
  const db = await getControlPlaneDb();
  const ts = nowIso();
  const float = Math.max(0, Math.round(openingFloatCents));
  const inserted = await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(adminRegisterSessions)
      .where(
        and(
          eq(adminRegisterSessions.organizationId, organizationId),
          eq(adminRegisterSessions.status, "open")
        )
      )
      .limit(1);
    if (existing[0]) {
      throw new Error("A register session is already open.");
    }
    return tx
      .insert(adminRegisterSessions)
      .values({
        organizationId,
        status: "open",
        openedAt: ts,
        openedByEmployeeId:
          session.role === "employee" ? session.employeeId : undefined,
        openedByAdminId: session.role === "admin" ? session.adminId : undefined,
        openingFloatCents: float,
        createdAt: ts,
      })
      .returning();
  });
  await appendRegisterAudit(
    organizationId,
    "register.open",
    "register_session",
    inserted[0]!.id,
    { openingFloatCents },
    session
  );
  return inserted[0]!;
}

export async function computeExpectedCashCents(
  registerSessionId: number,
  openingFloatCents: number
) {
  const db = await getControlPlaneDb();
  const txs = await db
    .select()
    .from(adminRegisterTransactions)
    .where(eq(adminRegisterTransactions.registerSessionId, registerSessionId));
  let delta = 0;
  for (const tx of txs) {
    if (transactionAffectsCashDrawer(tx)) delta += tx.amountCents;
  }
  return openingFloatCents + delta;
}

export async function getOpenRegisterWithReconciliation(organizationId: number) {
  const session = await getOpenRegisterSession(organizationId);
  if (!session) {
    return { session: null, expectedCashCents: null as number | null };
  }
  const expectedCashCents = await computeExpectedCashCents(
    session.id,
    session.openingFloatCents
  );
  return { session, expectedCashCents };
}

export async function listClosedRegisterSessions(
  organizationId: number,
  from: string,
  to: string
) {
  const db = await getControlPlaneDb();
  return db
    .select()
    .from(adminRegisterSessions)
    .where(
      and(
        eq(adminRegisterSessions.organizationId, organizationId),
        eq(adminRegisterSessions.status, "closed"),
        gte(adminRegisterSessions.closedAt, from),
        lte(adminRegisterSessions.closedAt, to)
      )
    )
    .orderBy(desc(adminRegisterSessions.closedAt));
}

export async function closeRegisterSession(
  organizationId: number,
  session: SessionUser,
  closingCashCountedCents: number,
  closingNotes?: string
) {
  const counted = Math.round(closingCashCountedCents);
  const db = await getControlPlaneDb();
  const ts = nowIso();

  const closedSessionId = await db.transaction(async (tx) => {
    const [open] = await tx
      .select()
      .from(adminRegisterSessions)
      .where(
        and(
          eq(adminRegisterSessions.organizationId, organizationId),
          eq(adminRegisterSessions.status, "open")
        )
      )
      .limit(1);
    if (!open) throw new Error("No open register session.");

    const txs = await tx
      .select()
      .from(adminRegisterTransactions)
      .where(eq(adminRegisterTransactions.registerSessionId, open.id));
    let cashDelta = 0;
    for (const row of txs) {
      if (transactionAffectsCashDrawer(row)) cashDelta += row.amountCents;
    }
    const expectedCashCents = open.openingFloatCents + cashDelta;
    const cashVarianceCents = counted - expectedCashCents;

    await tx
      .update(adminRegisterSessions)
      .set({
        status: "closed",
        closedAt: ts,
        closedByEmployeeId:
          session.role === "employee" ? session.employeeId : undefined,
        closedByAdminId: session.role === "admin" ? session.adminId : undefined,
        closingCashCountedCents: counted,
        expectedCashCents,
        cashVarianceCents,
        closingNotes: closingNotes?.trim() || null,
      })
      .where(eq(adminRegisterSessions.id, open.id));

    await tx
      .update(adminRegisterTransactions)
      .set({ locked: true, updatedAt: ts })
      .where(eq(adminRegisterTransactions.registerSessionId, open.id));

    return { sessionId: open.id, expectedCashCents, cashVarianceCents };
  });

  await appendRegisterAudit(
    organizationId,
    "register.close",
    "register_session",
    closedSessionId.sessionId,
    {
      closingCashCountedCents: counted,
      expectedCashCents: closedSessionId.expectedCashCents,
      cashVarianceCents: closedSessionId.cashVarianceCents,
      closingNotes,
    },
    session
  );
  const updated = await db
    .select()
    .from(adminRegisterSessions)
    .where(eq(adminRegisterSessions.id, closedSessionId.sessionId))
    .limit(1);
  return updated[0]!;
}

export type ListTransactionsFilters = {
  from?: string;
  to?: string;
  paymentMethod?: AdminPaymentMethod;
  kind?: AdminTransactionKind;
  registerSessionId?: number;
  /** Matches customer, invoice #, purpose, notes, and related text fields. */
  search?: string;
  limit?: number;
};

export async function listRegisterTransactions(
  organizationId: number,
  filters: ListTransactionsFilters = {}
) {
  const db = await getControlPlaneDb();
  const conditions = [eq(adminRegisterTransactions.organizationId, organizationId)];
  if (filters.from) {
    conditions.push(gte(adminRegisterTransactions.recordedAt, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(adminRegisterTransactions.recordedAt, filters.to));
  }
  if (filters.paymentMethod) {
    conditions.push(
      eq(adminRegisterTransactions.paymentMethod, filters.paymentMethod)
    );
  }
  if (filters.kind) {
    conditions.push(eq(adminRegisterTransactions.kind, filters.kind));
  }
  if (filters.registerSessionId) {
    conditions.push(
      eq(adminRegisterTransactions.registerSessionId, filters.registerSessionId)
    );
  }
  if (filters.search?.trim()) {
    const pattern = likeSearchPattern(filters.search);
    conditions.push(
      or(
        like(adminRegisterTransactions.counterpartyName, pattern),
        like(adminRegisterTransactions.invoiceReference, pattern),
        like(adminRegisterTransactions.purpose, pattern),
        like(adminRegisterTransactions.expenseCategory, pattern),
        like(adminRegisterTransactions.notes, pattern),
        like(adminRegisterTransactions.receiptReference, pattern),
        like(adminRegisterTransactions.paymentMethod, pattern),
        like(adminRegisterTransactions.kind, pattern)
      )!
    );
  }
  const limit = Math.min(filters.limit ?? 500, 2000);
  return db
    .select()
    .from(adminRegisterTransactions)
    .where(and(...conditions))
    .orderBy(desc(adminRegisterTransactions.recordedAt))
    .limit(limit);
}

export type CreateTransactionInput = {
  kind: string;
  paymentMethod?: string | null;
  amountCents: number;
  counterpartyName?: string | null;
  purpose?: string | null;
  expenseCategory?: string | null;
  orderId?: number | null;
  invoiceReference?: string | null;
  receiptReference?: string | null;
  notes?: string | null;
  recordedAt?: string;
  idempotencyKey?: string | null;
  salesEmployeeId?: number | null;
  salesAgentName?: string | null;
};

async function resolveSalesAgentForPayment(
  input: Pick<
    CreateTransactionInput,
    "invoiceReference" | "salesEmployeeId" | "salesAgentName" | "orderId"
  >
) {
  let salesEmployeeId = input.salesEmployeeId ?? null;
  let salesAgentName = input.salesAgentName?.trim() || null;
  let orderId = input.orderId ?? null;

  if (input.invoiceReference?.trim()) {
    const order = await getOrderByInvoiceNumber(input.invoiceReference.trim());
    if (order) {
      orderId = order.id;
      if (!salesEmployeeId && order.salesEmployeeId) {
        salesEmployeeId = order.salesEmployeeId;
      }
      if (!salesAgentName && order.salesAgentName) {
        salesAgentName = order.salesAgentName.trim();
      }
    }
  }

  if (salesEmployeeId && !salesAgentName) {
    const employee = await getEmployee(salesEmployeeId);
    if (employee?.name) salesAgentName = employee.name;
  }

  return { salesEmployeeId, salesAgentName, orderId };
}

export async function createRegisterTransaction(
  organizationId: number,
  session: SessionUser,
  input: CreateTransactionInput
) {
  if (!isAdminTransactionKind(input.kind)) {
    throw new Error("Invalid transaction kind.");
  }
  const kind = input.kind;
  if (input.paymentMethod && !isAdminPaymentMethod(input.paymentMethod)) {
    throw new Error("Invalid payment method.");
  }
  if (
    (kind === "payment" || kind === "return_refund") &&
    !input.paymentMethod
  ) {
    throw new Error("Payment method is required.");
  }
  if (kind === "expense" && !input.expenseCategory?.trim()) {
    throw new Error("Expense category is required.");
  }

  const open = await getOpenRegisterSession(organizationId);
  const cashier = session.role === "employee" && isCashierStaff(session.roles);
  if (cashier && !open) {
    throw new Error("Open the cash register before recording transactions.");
  }

  const db = await getControlPlaneDb();
  const ts = nowIso();
  const recordedAt = input.recordedAt?.trim() || ts;
  const amountCents = signedAmountCents(kind, input.amountCents);

  const mergedForCreate = {
    kind,
    counterpartyName: input.counterpartyName ?? null,
    invoiceReference: input.invoiceReference ?? null,
    salesEmployeeId: input.salesEmployeeId ?? null,
    salesAgentName: input.salesAgentName ?? null,
  };
  const salesResolved = await resolveRegisterTraceability(
    organizationId,
    mergedForCreate
  );

  let orderId = input.orderId ?? salesResolved.orderId ?? null;
  let salesEmployeeId: number | null = salesResolved.salesEmployeeId;
  let salesAgentName: string | null = salesResolved.salesAgentName;
  if (isIncomeLikeRegisterKind(kind) && salesResolved.orderId) {
    orderId = salesResolved.orderId;
  }

  const idempotencyKey = input.idempotencyKey?.trim() || null;
  if (idempotencyKey) {
    const existing = await db
      .select()
      .from(adminRegisterTransactions)
      .where(
        and(
          eq(adminRegisterTransactions.organizationId, organizationId),
          eq(adminRegisterTransactions.idempotencyKey, idempotencyKey)
        )
      )
      .limit(1);
    if (existing[0]) return existing[0]!;
  }

  const inserted = await db
    .insert(adminRegisterTransactions)
    .values({
      organizationId,
      registerSessionId: open?.id,
      kind,
      paymentMethod: input.paymentMethod ?? null,
      amountCents,
      counterpartyName: input.counterpartyName?.trim() || null,
      purpose: input.purpose?.trim() || null,
      expenseCategory: input.expenseCategory?.trim() || null,
      orderId,
      invoiceReference: input.invoiceReference?.trim() || null,
      receiptReference: input.receiptReference?.trim() || null,
      recordedByEmployeeId:
        session.role === "employee" ? session.employeeId : undefined,
      recordedByAdminId: session.role === "admin" ? session.adminId : undefined,
      recordedAt,
      locked: false,
      notes: input.notes?.trim() || null,
      idempotencyKey: idempotencyKey ?? undefined,
      salesEmployeeId: salesEmployeeId ?? undefined,
      salesAgentName: salesAgentName ?? undefined,
      createdAt: ts,
      updatedAt: ts,
    })
    .returning();

  await appendRegisterAudit(
    organizationId,
    "transaction.create",
    "register_transaction",
    inserted[0]!.id,
    { kind, amountCents, paymentMethod: input.paymentMethod },
    session
  );
  return inserted[0]!;
}

export type ProposedTransactionPatch = Partial<{
  kind: AdminTransactionKind;
  paymentMethod: AdminPaymentMethod | null;
  amountCents: number;
  counterpartyName: string | null;
  purpose: string | null;
  expenseCategory: string | null;
  invoiceReference: string | null;
  receiptReference: string | null;
  notes: string | null;
  salesEmployeeId: number | null;
  salesAgentName: string | null;
}>;

function mergedTraceabilityFields(
  tx: RegisterTransactionRow,
  patch: ProposedTransactionPatch
) {
  return {
    kind: patch.kind ?? tx.kind,
    counterpartyName:
      patch.counterpartyName !== undefined
        ? patch.counterpartyName
        : tx.counterpartyName,
    invoiceReference:
      patch.invoiceReference !== undefined
        ? patch.invoiceReference
        : tx.invoiceReference,
    salesEmployeeId:
      patch.salesEmployeeId !== undefined
        ? patch.salesEmployeeId
        : tx.salesEmployeeId,
    salesAgentName:
      patch.salesAgentName !== undefined
        ? patch.salesAgentName
        : tx.salesAgentName,
  };
}

async function resolveSalesForIncomeKind(
  merged: ReturnType<typeof mergedTraceabilityFields>
) {
  if (!isIncomeLikeRegisterKind(merged.kind)) {
    return {
      salesEmployeeId: null as number | null,
      salesAgentName: null as string | null,
      orderId: null as number | null,
    };
  }
  const resolved = await resolveSalesAgentForPayment({
    invoiceReference: merged.invoiceReference,
    salesEmployeeId: merged.salesEmployeeId,
    salesAgentName: merged.salesAgentName,
  });
  assertSalesAgentRequired(merged.kind, resolved.salesEmployeeId);
  return resolved;
}

async function assertRegisterMutationIntegrity(
  organizationId: number,
  merged: ReturnType<typeof mergedTraceabilityFields>,
  excludeTransactionId?: number
) {
  assertRegisterInvoiceReference(merged.invoiceReference);
  assertPaymentIncomeRequiredFields(
    merged.kind,
    merged.counterpartyName,
    merged.invoiceReference
  );
  await assertNoDuplicatePaymentInvoice(
    organizationId,
    merged.kind,
    merged.invoiceReference,
    excludeTransactionId
  );
  return resolveSalesForIncomeKind(merged);
}

async function resolveRegisterTraceability(
  organizationId: number,
  merged: ReturnType<typeof mergedTraceabilityFields>,
  excludeTransactionId?: number
) {
  const settings = await getAdministrationSettings(organizationId);
  if (settings.registerStrictTraceability) {
    return assertRegisterMutationIntegrity(
      organizationId,
      merged,
      excludeTransactionId
    );
  }

  if (isIncomeLikeRegisterKind(merged.kind)) {
    const resolved = await resolveSalesAgentForPayment({
      invoiceReference: merged.invoiceReference,
      salesEmployeeId: merged.salesEmployeeId,
      salesAgentName: merged.salesAgentName,
    });
    if (merged.invoiceReference?.trim()) {
      await assertNoDuplicatePaymentInvoice(
        organizationId,
        merged.kind,
        merged.invoiceReference,
        excludeTransactionId
      );
    }
    return resolved;
  }

  return {
    salesEmployeeId: null as number | null,
    salesAgentName: null as string | null,
    orderId: null as number | null,
  };
}

export async function createTransactionEditRequest(
  organizationId: number,
  session: SessionUser,
  transactionId: number,
  reason: string,
  proposedChanges: ProposedTransactionPatch
) {
  if (
    session.role !== "admin" &&
    sessionHasPermission(session, PERMISSIONS.administrationApprove)
  ) {
    throw new Error(
      "Management cannot submit correction requests — edit open entries or review pending requests."
    );
  }
  const db = await getControlPlaneDb();
  const [tx] = await db
    .select()
    .from(adminRegisterTransactions)
    .where(
      and(
        eq(adminRegisterTransactions.id, transactionId),
        eq(adminRegisterTransactions.organizationId, organizationId)
      )
    )
    .limit(1);
  if (!tx) throw new Error("Transaction not found.");
  if (!tx.locked) {
    throw new Error(
      "Unlocked entries can be corrected by management without a request."
    );
  }
  const pending = await db
    .select()
    .from(adminRegisterEditRequests)
    .where(
      and(
        eq(adminRegisterEditRequests.transactionId, transactionId),
        eq(adminRegisterEditRequests.status, "pending")
      )
    )
    .limit(1);
  if (pending[0]) throw new Error("An edit request is already pending.");

  const merged = mergedTraceabilityFields(tx, proposedChanges);
  await resolveRegisterTraceability(organizationId, merged, tx.id);

  const ts = nowIso();
  const inserted = await db
    .insert(adminRegisterEditRequests)
    .values({
      organizationId,
      transactionId,
      requestedByEmployeeId:
        session.role === "employee" ? session.employeeId : undefined,
      requestedByAdminId: session.role === "admin" ? session.adminId : undefined,
      reason: reason.trim(),
      proposedChangesJson: JSON.stringify(proposedChanges),
      status: "pending",
      createdAt: ts,
    })
    .returning();

  await appendRegisterAudit(
    organizationId,
    "edit_request.create",
    "edit_request",
    inserted[0]!.id,
    { transactionId, proposedChanges },
    session
  );
  return inserted[0]!;
}

export async function reviewTransactionEditRequest(
  organizationId: number,
  session: SessionUser,
  requestId: number,
  approve: boolean,
  reviewNotes?: string
) {
  if (!sessionHasPermission(session, PERMISSIONS.administrationApprove)) {
    throw new Error("Forbidden");
  }
  const db = await getControlPlaneDb();
  const [req] = await db
    .select()
    .from(adminRegisterEditRequests)
    .where(
      and(
        eq(adminRegisterEditRequests.id, requestId),
        eq(adminRegisterEditRequests.organizationId, organizationId),
        eq(adminRegisterEditRequests.status, "pending")
      )
    )
    .limit(1);
  if (!req) throw new Error("Edit request not found.");

  const ts = nowIso();
  if (!approve) {
    await db
      .update(adminRegisterEditRequests)
      .set({
        status: "rejected",
        reviewedByAdminId:
          session.role === "admin" ? session.adminId : undefined,
        reviewedByEmployeeId:
          session.role === "employee" ? session.employeeId : undefined,
        reviewNotes: reviewNotes?.trim() || null,
        reviewedAt: ts,
      })
      .where(eq(adminRegisterEditRequests.id, requestId));
    await appendRegisterAudit(
      organizationId,
      "edit_request.reject",
      "edit_request",
      requestId,
      { reviewNotes },
      session
    );
    return { status: "rejected" as const };
  }

  const patch = JSON.parse(req.proposedChangesJson) as ProposedTransactionPatch;
  const [tx] = await db
    .select()
    .from(adminRegisterTransactions)
    .where(eq(adminRegisterTransactions.id, req.transactionId))
    .limit(1);
  if (!tx) throw new Error("Transaction missing.");

  const merged = mergedTraceabilityFields(tx, patch);
  const salesResolved = await resolveRegisterTraceability(
    organizationId,
    merged,
    tx.id
  );

  let amountCents = tx.amountCents;
  if (patch.amountCents != null) {
    const kind = (patch.kind ?? tx.kind) as AdminTransactionKind;
    amountCents = signedAmountCents(kind, patch.amountCents);
  } else if (patch.kind && isAdminTransactionKind(patch.kind)) {
    amountCents = signedAmountCents(patch.kind, Math.abs(tx.amountCents));
  }

  await db
    .update(adminRegisterTransactions)
    .set({
      kind: patch.kind ?? tx.kind,
      paymentMethod:
        patch.paymentMethod !== undefined
          ? patch.paymentMethod
          : tx.paymentMethod,
      amountCents,
      counterpartyName:
        patch.counterpartyName !== undefined
          ? patch.counterpartyName
          : tx.counterpartyName,
      purpose: patch.purpose !== undefined ? patch.purpose : tx.purpose,
      expenseCategory:
        patch.expenseCategory !== undefined
          ? patch.expenseCategory
          : tx.expenseCategory,
      invoiceReference:
        patch.invoiceReference !== undefined
          ? patch.invoiceReference
          : tx.invoiceReference,
      receiptReference:
        patch.receiptReference !== undefined
          ? patch.receiptReference
          : tx.receiptReference,
      notes: patch.notes !== undefined ? patch.notes : tx.notes,
      salesEmployeeId: isIncomeLikeRegisterKind(merged.kind)
        ? (salesResolved.salesEmployeeId ?? undefined)
        : undefined,
      salesAgentName: isIncomeLikeRegisterKind(merged.kind)
        ? (salesResolved.salesAgentName ?? undefined)
        : undefined,
      updatedAt: ts,
    })
    .where(eq(adminRegisterTransactions.id, req.transactionId));

  await db
    .update(adminRegisterEditRequests)
    .set({
      status: "approved",
      reviewedByAdminId:
        session.role === "admin" ? session.adminId : undefined,
      reviewedByEmployeeId:
        session.role === "employee" ? session.employeeId : undefined,
      reviewNotes: reviewNotes?.trim() || null,
      reviewedAt: ts,
    })
    .where(eq(adminRegisterEditRequests.id, requestId));

  await appendRegisterAudit(
    organizationId,
    "edit_request.approve",
    "edit_request",
    requestId,
    { patch },
    session
  );
  return { status: "approved" as const };
}

export async function patchRegisterTransaction(
  organizationId: number,
  session: SessionUser,
  transactionId: number,
  patch: ProposedTransactionPatch
) {
  if (!sessionHasPermission(session, PERMISSIONS.administrationApprove)) {
    throw new Error("Forbidden");
  }
  const db = await getControlPlaneDb();
  const [tx] = await db
    .select()
    .from(adminRegisterTransactions)
    .where(
      and(
        eq(adminRegisterTransactions.id, transactionId),
        eq(adminRegisterTransactions.organizationId, organizationId)
      )
    )
    .limit(1);
  if (!tx) throw new Error("Transaction not found.");

  const merged = mergedTraceabilityFields(tx, patch);
  const salesResolved = await resolveRegisterTraceability(
    organizationId,
    merged,
    transactionId
  );
  const mergedExpense =
    patch.expenseCategory !== undefined
      ? patch.expenseCategory
      : tx.expenseCategory;
  if (merged.kind === "expense" && !mergedExpense?.trim()) {
    throw new Error("Expense category is required.");
  }

  let amountCents = tx.amountCents;
  if (patch.amountCents != null) {
    const kind = (patch.kind ?? tx.kind) as AdminTransactionKind;
    amountCents = signedAmountCents(kind, patch.amountCents);
  }

  const ts = nowIso();
  await db
    .update(adminRegisterTransactions)
    .set({
      kind: patch.kind ?? tx.kind,
      paymentMethod:
        patch.paymentMethod !== undefined
          ? patch.paymentMethod
          : tx.paymentMethod,
      amountCents,
      counterpartyName:
        patch.counterpartyName !== undefined
          ? patch.counterpartyName
          : tx.counterpartyName,
      purpose: patch.purpose !== undefined ? patch.purpose : tx.purpose,
      expenseCategory:
        patch.expenseCategory !== undefined
          ? patch.expenseCategory
          : tx.expenseCategory,
      invoiceReference:
        patch.invoiceReference !== undefined
          ? patch.invoiceReference
          : tx.invoiceReference,
      receiptReference:
        patch.receiptReference !== undefined
          ? patch.receiptReference
          : tx.receiptReference,
      notes: patch.notes !== undefined ? patch.notes : tx.notes,
      salesEmployeeId: isIncomeLikeRegisterKind(merged.kind)
        ? (salesResolved.salesEmployeeId ?? undefined)
        : patch.salesEmployeeId !== undefined
          ? (patch.salesEmployeeId ?? undefined)
          : tx.salesEmployeeId ?? undefined,
      salesAgentName: isIncomeLikeRegisterKind(merged.kind)
        ? (salesResolved.salesAgentName ?? undefined)
        : patch.salesAgentName !== undefined
          ? (patch.salesAgentName ?? undefined)
          : tx.salesAgentName ?? undefined,
      updatedAt: ts,
    })
    .where(eq(adminRegisterTransactions.id, transactionId));

  await appendRegisterAudit(
    organizationId,
    "transaction.patch",
    "register_transaction",
    transactionId,
    { ...patch, locked: tx.locked },
    session
  );
}

export async function deleteRegisterTransaction(
  organizationId: number,
  session: SessionUser,
  transactionId: number
) {
  if (!sessionHasPermission(session, PERMISSIONS.administrationApprove)) {
    throw new Error("Forbidden");
  }
  const db = await getControlPlaneDb();
  const [tx] = await db
    .select()
    .from(adminRegisterTransactions)
    .where(
      and(
        eq(adminRegisterTransactions.id, transactionId),
        eq(adminRegisterTransactions.organizationId, organizationId)
      )
    )
    .limit(1);
  if (!tx) throw new Error("Transaction not found.");

  await db
    .delete(adminRegisterTransactions)
    .where(eq(adminRegisterTransactions.id, transactionId));

  await appendRegisterAudit(
    organizationId,
    "transaction.delete",
    "register_transaction",
    transactionId,
    {
      kind: tx.kind,
      amountCents: tx.amountCents,
      paymentMethod: tx.paymentMethod,
      counterpartyName: tx.counterpartyName,
      invoiceReference: tx.invoiceReference,
      locked: tx.locked,
    },
    session
  );
}

export async function listPendingEditRequests(organizationId: number) {
  const db = await getControlPlaneDb();
  return db
    .select()
    .from(adminRegisterEditRequests)
    .where(
      and(
        eq(adminRegisterEditRequests.organizationId, organizationId),
        eq(adminRegisterEditRequests.status, "pending")
      )
    )
    .orderBy(desc(adminRegisterEditRequests.createdAt));
}

export async function getRegisterReportSummary(
  organizationId: number,
  from: string,
  to: string
) {
  const db = await getControlPlaneDb();
  const rows = await db
    .select({
      paymentMethod: adminRegisterTransactions.paymentMethod,
      kind: adminRegisterTransactions.kind,
      totalCents: sql<number>`sum(${adminRegisterTransactions.amountCents})`,
      count: sql<number>`count(*)`,
    })
    .from(adminRegisterTransactions)
    .where(
      and(
        eq(adminRegisterTransactions.organizationId, organizationId),
        gte(adminRegisterTransactions.recordedAt, from),
        lte(adminRegisterTransactions.recordedAt, to)
      )
    )
    .groupBy(
      adminRegisterTransactions.paymentMethod,
      adminRegisterTransactions.kind
    );

  const grandTotal = rows.reduce((s, r) => s + Number(r.totalCents ?? 0), 0);
  return { rows, grandTotalCents: grandTotal };
}

export type RegisterFinanceOverview = {
  from: string;
  to: string;
  incomeCents: number;
  expenseCents: number;
  refundCents: number;
  netCents: number;
  paymentCount: number;
  expenseCount: number;
  cashDrawerCents: number | null;
  registerOpen: boolean;
  byPaymentMethod: Array<{
    paymentMethod: string | null;
    totalCents: number;
    count: number;
  }>;
};

export async function getRegisterFinanceOverview(
  organizationId: number,
  from: string,
  to: string
): Promise<RegisterFinanceOverview> {
  const db = await getControlPlaneDb();
  const lines = await db
    .select()
    .from(adminRegisterTransactions)
    .where(
      and(
        eq(adminRegisterTransactions.organizationId, organizationId),
        gte(adminRegisterTransactions.recordedAt, from),
        lte(adminRegisterTransactions.recordedAt, to)
      )
    );

  let incomeCents = 0;
  let expenseCents = 0;
  let refundCents = 0;
  let paymentCount = 0;
  let expenseCount = 0;
  const methodMap = new Map<string | null, { totalCents: number; count: number }>();

  for (const line of lines) {
    const kind = line.kind as AdminTransactionKind;
    if (kind === "payment" || kind === "adjustment") {
      if (line.amountCents > 0) {
        incomeCents += line.amountCents;
        if (kind === "payment") paymentCount += 1;
      }
    } else if (kind === "expense") {
      expenseCents += Math.abs(line.amountCents);
      expenseCount += 1;
    } else if (kind === "return_refund") {
      refundCents += Math.abs(line.amountCents);
    }

    if (kind === "payment" || kind === "return_refund") {
      const key = line.paymentMethod ?? null;
      const prev = methodMap.get(key) ?? { totalCents: 0, count: 0 };
      methodMap.set(key, {
        totalCents: prev.totalCents + line.amountCents,
        count: prev.count + 1,
      });
    }
  }

  const open = await getOpenRegisterSession(organizationId);
  let cashDrawerCents: number | null = null;
  if (open) {
    cashDrawerCents = await computeExpectedCashCents(
      open.id,
      open.openingFloatCents
    );
  }

  return {
    from,
    to,
    incomeCents,
    expenseCents,
    refundCents,
    netCents: incomeCents - expenseCents - refundCents,
    paymentCount,
    expenseCount,
    cashDrawerCents,
    registerOpen: Boolean(open),
    byPaymentMethod: [...methodMap.entries()].map(([paymentMethod, v]) => ({
      paymentMethod,
      ...v,
    })),
  };
}

export type RegisterAuditLogEntry = {
  id: number;
  category: "administration";
  message: string;
  createdAt: string;
  source: "administration";
  detailsParsed: Record<string, unknown> | null;
};

export async function listRegisterAuditLogEntries(
  organizationId: number,
  filters?: {
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    employeeId?: number;
  }
): Promise<RegisterAuditLogEntry[]> {
  const db = await getControlPlaneDb();
  const conditions = [
    eq(adminRegisterAuditLog.organizationId, organizationId),
  ];
  if (filters?.dateFrom) {
    conditions.push(gte(adminRegisterAuditLog.createdAt, filters.dateFrom));
  }
  if (filters?.dateTo) {
    const to = filters.dateTo.includes("T")
      ? filters.dateTo
      : `${filters.dateTo}T23:59:59.999Z`;
    conditions.push(lte(adminRegisterAuditLog.createdAt, to));
  }
  if (filters?.employeeId) {
    conditions.push(
      eq(adminRegisterAuditLog.actorEmployeeId, filters.employeeId)
    );
  }

  const rows = await db
    .select({
      id: adminRegisterAuditLog.id,
      action: adminRegisterAuditLog.action,
      entityType: adminRegisterAuditLog.entityType,
      entityId: adminRegisterAuditLog.entityId,
      payloadJson: adminRegisterAuditLog.payloadJson,
      actorEmployeeId: adminRegisterAuditLog.actorEmployeeId,
      actorAdminId: adminRegisterAuditLog.actorAdminId,
      createdAt: adminRegisterAuditLog.createdAt,
      employeeName: employees.name,
      adminUsername: admins.username,
    })
    .from(adminRegisterAuditLog)
    .leftJoin(
      employees,
      eq(adminRegisterAuditLog.actorEmployeeId, employees.id)
    )
    .leftJoin(admins, eq(adminRegisterAuditLog.actorAdminId, admins.id))
    .where(and(...conditions))
    .orderBy(desc(adminRegisterAuditLog.createdAt))
    .limit(500);

  let mapped: RegisterAuditLogEntry[] = rows.map((row) => {
    const actorLabel =
      row.employeeName?.trim() ||
      row.adminUsername?.trim() ||
      (row.actorEmployeeId ? `Employee #${row.actorEmployeeId}` : null) ||
      (row.actorAdminId ? `Admin #${row.actorAdminId}` : null);
    const message = formatRegisterAuditLogMessage({
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      payloadJson: row.payloadJson,
      actorLabel,
    });
    let detailsParsed: Record<string, unknown> | null = null;
    if (row.payloadJson) {
      try {
        detailsParsed = JSON.parse(row.payloadJson) as Record<string, unknown>;
      } catch {
        detailsParsed = null;
      }
    }
    return {
      id: row.id,
      category: "administration",
      message,
      createdAt: row.createdAt,
      source: "administration",
      detailsParsed,
    };
  });

  if (filters?.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    mapped = mapped.filter(
      (log) =>
        log.message.toLowerCase().includes(q) ||
        (log.detailsParsed &&
          JSON.stringify(log.detailsParsed).toLowerCase().includes(q))
    );
  }

  return mapped;
}

export function canAccessAdministration(session: SessionUser): boolean {
  if (session.role === "admin") return true;
  return sessionHasPermission(session, PERMISSIONS.administrationRead);
}

export function canWriteAdministration(session: SessionUser): boolean {
  if (session.role === "admin") return true;
  return sessionHasPermission(session, PERMISSIONS.administrationWrite);
}
