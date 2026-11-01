import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getControlPlaneDb } from "@/lib/db";
import {
  adminRegisterAuditLog,
  adminRegisterEditRequests,
  adminRegisterSessions,
  adminRegisterTransactions,
} from "@/lib/db/schema";
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

export type RegisterSessionRow = typeof adminRegisterSessions.$inferSelect;
export type RegisterTransactionRow = typeof adminRegisterTransactions.$inferSelect;

function nowIso() {
  return new Date().toISOString();
}

function signedAmountCents(kind: AdminTransactionKind, amountCents: number) {
  const abs = Math.abs(Math.round(amountCents));
  if (kind === "expense" || kind === "return_refund") return -abs;
  return abs;
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
  const existing = await getOpenRegisterSession(organizationId);
  if (existing) {
    throw new Error("A register session is already open.");
  }
  const db = await getControlPlaneDb();
  const ts = nowIso();
  const inserted = await db
    .insert(adminRegisterSessions)
    .values({
      organizationId,
      status: "open",
      openedAt: ts,
      openedByEmployeeId:
        session.role === "employee" ? session.employeeId : undefined,
      openedByAdminId: session.role === "admin" ? session.adminId : undefined,
      openingFloatCents: Math.max(0, Math.round(openingFloatCents)),
      createdAt: ts,
    })
    .returning();
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
  const open = await getOpenRegisterSession(organizationId);
  if (!open) throw new Error("No open register session.");
  const counted = Math.round(closingCashCountedCents);
  const expectedCashCents = await computeExpectedCashCents(
    open.id,
    open.openingFloatCents
  );
  const cashVarianceCents = counted - expectedCashCents;
  const db = await getControlPlaneDb();
  const ts = nowIso();
  await db
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

  await db
    .update(adminRegisterTransactions)
    .set({ locked: true, updatedAt: ts })
    .where(eq(adminRegisterTransactions.registerSessionId, open.id));

  await appendRegisterAudit(
    organizationId,
    "register.close",
    "register_session",
    open.id,
    {
      closingCashCountedCents: counted,
      expectedCashCents,
      cashVarianceCents,
      closingNotes,
    },
    session
  );
  const updated = await db
    .select()
    .from(adminRegisterSessions)
    .where(eq(adminRegisterSessions.id, open.id))
    .limit(1);
  return updated[0]!;
}

export type ListTransactionsFilters = {
  from?: string;
  to?: string;
  paymentMethod?: AdminPaymentMethod;
  kind?: AdminTransactionKind;
  registerSessionId?: number;
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
};

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

  const open = await getOpenRegisterSession(organizationId);
  const cashier = session.role === "employee" && isCashierStaff(session.roles);
  if (cashier && !open) {
    throw new Error("Open the cash register before recording transactions.");
  }

  const db = await getControlPlaneDb();
  const ts = nowIso();
  const recordedAt = input.recordedAt?.trim() || ts;
  const amountCents = signedAmountCents(kind, input.amountCents);

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
      orderId: input.orderId ?? null,
      invoiceReference: input.invoiceReference?.trim() || null,
      receiptReference: input.receiptReference?.trim() || null,
      recordedByEmployeeId:
        session.role === "employee" ? session.employeeId : undefined,
      recordedByAdminId: session.role === "admin" ? session.adminId : undefined,
      recordedAt,
      locked: false,
      notes: input.notes?.trim() || null,
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
}>;

export async function createTransactionEditRequest(
  organizationId: number,
  session: SessionUser,
  transactionId: number,
  reason: string,
  proposedChanges: ProposedTransactionPatch
) {
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
  if (tx.locked) {
    throw new Error("Locked transaction — use edit request workflow.");
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
      updatedAt: ts,
    })
    .where(eq(adminRegisterTransactions.id, transactionId));

  await appendRegisterAudit(
    organizationId,
    "transaction.patch",
    "register_transaction",
    transactionId,
    patch,
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

export function canAccessAdministration(session: SessionUser): boolean {
  if (session.role === "admin") return true;
  return sessionHasPermission(session, PERMISSIONS.administrationRead);
}

export function canWriteAdministration(session: SessionUser): boolean {
  if (session.role === "admin") return true;
  return sessionHasPermission(session, PERMISSIONS.administrationWrite);
}
