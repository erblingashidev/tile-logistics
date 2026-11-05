import { and, eq } from "drizzle-orm";
import { getControlPlaneDb } from "@/lib/db";
import {
  financeProdataImportBatches,
  financeProdataInvoices,
} from "@/lib/db/schema";
import {
  isInvoiceSettlementAssignmentComplete,
  isInvoiceSettlementStatus,
  settlementPaidCentsFromStatus,
  settlementStatusRequiresAmount,
  type InvoiceSettlementStatus,
} from "@/lib/administration/invoice-settlement";
import {
  parseProDataTransactionBook,
  type FinanceDocumentCategory,
  type ProDataImportAnalysis,
  type ProDataInvoiceAggregate,
} from "@/lib/administration/prodata-transaction-book";
import type { AdminPaymentMethod } from "@/lib/administration/constants";
import {
  adminRegisterTransactions,
} from "@/lib/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import {
  appendRegisterAudit,
  createRegisterTransaction,
} from "@/lib/services/administration-register";
import {
  detectStoredImportConflicts,
  mergeInvoiceConflicts,
  normalizeBusinessDay,
  type InvoiceNumberConflict,
} from "@/lib/administration/prodata-invoice-conflicts";
import { invoiceMatchesAssignmentBusinessDay } from "@/lib/administration/business-day";

export type ProDataFinanceInvoiceRow = {
  invoiceNumber: string;
  documentCategory: FinanceDocumentCategory;
  transactionDate: string;
  buyerName: string;
  salesAgentName: string | null;
  netValueCents: number;
  lineCount: number;
  paymentMethod: string | null;
  paymentMethodRaw: string | null;
  settlementStatus: InvoiceSettlementStatus;
  paidAmountCents: number | null;
};

export type ProDataInvoiceSettlementOverride = {
  invoiceNumber: string;
  settlementStatus: InvoiceSettlementStatus;
  paidAmountCents?: number | null;
  paymentMethod?: AdminPaymentMethod | null;
};

export function applySettlementOverrides(
  analysis: ProDataImportAnalysis,
  overrides: ProDataInvoiceSettlementOverride[]
): ProDataImportAnalysis {
  if (overrides.length === 0) return analysis;
  const byInv = new Map(
    overrides.map((o) => [o.invoiceNumber.trim().toLowerCase(), o])
  );
  const invoices = analysis.invoices.map((inv) => {
    const o = byInv.get(inv.invoiceNumber.trim().toLowerCase());
    if (!o) return inv;
    if (!isInvoiceSettlementStatus(o.settlementStatus)) return inv;
    let paidAmountCents = o.paidAmountCents ?? inv.paidAmountCents;
    if (
      settlementStatusRequiresAmount(o.settlementStatus) &&
      paidAmountCents == null
    ) {
      paidAmountCents = null;
    }
    return {
      ...inv,
      settlementStatus: o.settlementStatus,
      paidAmountCents,
      paymentMethod:
        o.paymentMethod !== undefined ? o.paymentMethod : inv.paymentMethod,
    };
  });
  return { ...analysis, invoices };
}

export function analyzeProDataFinanceExport(
  buffer: Buffer,
  fileName: string
): ProDataImportAnalysis {
  return parseProDataTransactionBook(buffer, fileName);
}

export async function listProDataInvoicesPendingAssignment(
  organizationId: number,
  businessDay?: string | null
): Promise<ProDataFinanceInvoiceRow[]> {
  const all = await listProDataFinanceInvoices(organizationId);
  return all.filter(
    (inv) =>
      inv.documentCategory !== "delivery_note" &&
      invoiceMatchesAssignmentBusinessDay(
        inv.transactionDate,
        businessDay
      ) &&
      !isInvoiceSettlementAssignmentComplete({
        settlementStatus: inv.settlementStatus,
        paidAmountCents: inv.paidAmountCents,
        paymentMethod: inv.paymentMethod,
      })
  );
}

export async function listProDataFinanceInvoices(
  organizationId: number
): Promise<ProDataFinanceInvoiceRow[]> {
  const db = await getControlPlaneDb();
  const rows = await db
    .select()
    .from(financeProdataInvoices)
    .where(eq(financeProdataInvoices.organizationId, organizationId));

  return rows.map((r) => ({
    invoiceNumber: r.invoiceNumber,
    documentCategory: r.documentCategory as FinanceDocumentCategory,
    transactionDate: r.transactionDate,
    buyerName: r.buyerName,
    salesAgentName: r.salesAgentName,
    netValueCents: r.netValueCents,
    lineCount: r.lineCount,
    paymentMethod: r.paymentMethod,
    paymentMethodRaw: r.paymentMethodRaw,
    settlementStatus: (r.settlementStatus ??
      "unknown") as InvoiceSettlementStatus,
    paidAmountCents: r.paidAmountCents,
  }));
}

export async function updateProDataInvoiceSettlement(
  organizationId: number,
  invoiceNumber: string,
  patch: ProDataInvoiceSettlementOverride,
  session?: SessionUser
) {
  const db = await getControlPlaneDb();
  if (!isInvoiceSettlementStatus(patch.settlementStatus)) {
    throw new Error("Invalid settlement status.");
  }
  if (
    settlementStatusRequiresAmount(patch.settlementStatus) &&
    (patch.paidAmountCents == null || patch.paidAmountCents <= 0)
  ) {
    throw new Error("Enter the amount paid or prepaid for partial status.");
  }
  const trimmed = invoiceNumber.trim();
  const existing = await db
    .select()
    .from(financeProdataInvoices)
    .where(
      and(
        eq(financeProdataInvoices.organizationId, organizationId),
        eq(financeProdataInvoices.invoiceNumber, trimmed)
      )
    )
    .limit(1);
  const row = existing[0];
  if (!row) {
    throw new Error("Invoice not found in Pro-Data import data.");
  }
  const ts = new Date().toISOString();
  const set: Record<string, unknown> = {
    settlementStatus: patch.settlementStatus,
    paidAmountCents: patch.paidAmountCents ?? null,
    updatedAt: ts,
  };
  if (patch.paymentMethod !== undefined) {
    set.paymentMethod = patch.paymentMethod;
  }
  await db
    .update(financeProdataInvoices)
    .set(set)
    .where(eq(financeProdataInvoices.id, row.id));

  if (session) {
    await appendRegisterAudit(
      organizationId,
      "settlement_updated",
      "finance_invoice",
      row.id,
      {
        invoiceNumber: trimmed,
        before: {
          settlementStatus: row.settlementStatus,
          paidAmountCents: row.paidAmountCents,
          paymentMethod: row.paymentMethod,
          paymentMethodRaw: row.paymentMethodRaw,
        },
        after: {
          settlementStatus: patch.settlementStatus,
          paidAmountCents: patch.paidAmountCents ?? null,
          paymentMethod:
            patch.paymentMethod !== undefined
              ? patch.paymentMethod
              : row.paymentMethod,
          paymentMethodRaw: row.paymentMethodRaw,
        },
      },
      session
    );
  }
}

export type CommitProDataImportResult = {
  batchId: number;
  invoicesUpserted: number;
  registerPaymentsCreated: number;
  registerCreditsCreated: number;
  skippedRegisterDuplicates: number;
};

function idempotencyForInvoice(invoiceNumber: string, suffix: string) {
  return `prodata:${suffix}:${invoiceNumber.trim().toLowerCase()}`;
}

async function upsertProDataInvoice(
  organizationId: number,
  batchId: number,
  inv: ProDataInvoiceAggregate,
  ts: string,
  session?: SessionUser,
  importFileName?: string
) {
  const db = await getControlPlaneDb();
  const existing = await db
    .select({ id: financeProdataInvoices.id })
    .from(financeProdataInvoices)
    .where(
      and(
        eq(financeProdataInvoices.organizationId, organizationId),
        eq(financeProdataInvoices.invoiceNumber, inv.invoiceNumber)
      )
    )
    .limit(1);

  const values = {
    organizationId,
    batchId,
    invoiceNumber: inv.invoiceNumber,
    documentCategory: inv.documentCategory,
    transactionDate: inv.transactionDate,
    buyerName: inv.buyerName,
    salesAgentName: inv.salesAgentName || null,
    netValueCents: inv.netValueCents,
    lineCount: inv.lineCount,
    paymentMethodRaw: inv.paymentMethodRaw || null,
    paymentMethod: inv.paymentMethod,
    settlementStatus: inv.settlementStatus,
    paidAmountCents: inv.paidAmountCents,
    productSample: inv.productSample || null,
    updatedAt: ts,
  };

  let invoiceRowId = existing[0]?.id;
  if (existing[0]) {
    await db
      .update(financeProdataInvoices)
      .set(values)
      .where(eq(financeProdataInvoices.id, existing[0].id));
  } else {
    const inserted = await db
      .insert(financeProdataInvoices)
      .values(values)
      .returning({ id: financeProdataInvoices.id });
    invoiceRowId = inserted[0]?.id;
  }

  if (session && invoiceRowId != null) {
    await appendRegisterAudit(
      organizationId,
      "finance_invoice_import",
      "finance_invoice",
      invoiceRowId,
      {
        invoiceNumber: inv.invoiceNumber,
        fileName: importFileName ?? null,
        batchId,
        netValueCents: inv.netValueCents,
        settlementStatus: inv.settlementStatus,
        paidAmountCents: inv.paidAmountCents,
        paymentMethod: inv.paymentMethod,
        paymentMethodRaw: inv.paymentMethodRaw,
        transactionDate: inv.transactionDate,
      },
      session
    );
  }
}

async function registerImportExists(
  organizationId: number,
  idempotencyKey: string
) {
  const db = await getControlPlaneDb();
  const rows = await db
    .select({ id: adminRegisterTransactions.id })
    .from(adminRegisterTransactions)
    .where(
      and(
        eq(adminRegisterTransactions.organizationId, organizationId),
        eq(adminRegisterTransactions.idempotencyKey, idempotencyKey)
      )
    )
    .limit(1);
  return Boolean(rows[0]);
}

async function importRegisterLineForInvoice(
  organizationId: number,
  session: SessionUser,
  inv: ProDataInvoiceAggregate,
  stats: CommitProDataImportResult
) {
  const absCents = Math.abs(inv.netValueCents);
  if (absCents <= 0) return;

  const registerCents =
    inv.settlementStatus === "paid_partial" ||
    inv.settlementStatus === "prepaid_partial"
      ? inv.paidAmountCents ?? 0
      : inv.settlementStatus === "paid_full" ||
          inv.settlementStatus === "prepaid_full"
        ? absCents
        : 0;

  if (registerCents <= 0) return;
  if (!inv.paymentMethod) return;

  if (inv.documentCategory === "credit_note" || inv.netValueCents < 0) {
    const key = idempotencyForInvoice(inv.invoiceNumber, "credit");
    if (await registerImportExists(organizationId, key)) {
      stats.skippedRegisterDuplicates += 1;
      return;
    }
    await createRegisterTransaction(organizationId, session, {
      kind: "return_refund",
      paymentMethod: inv.paymentMethod,
      amountCents: registerCents,
      counterpartyName: inv.buyerName,
      invoiceReference: inv.invoiceNumber,
      salesAgentName: inv.salesAgentName || undefined,
      purpose: "Pro-Data credit note import",
      notes: `Imported from Pro-Data transaction book (${inv.paymentMethodRaw || inv.paymentMethod})`,
      recordedAt: `${inv.transactionDate}T12:00:00.000Z`,
      idempotencyKey: key,
    });
    stats.registerCreditsCreated += 1;
    return;
  }

  if (inv.documentCategory !== "sale" && inv.documentCategory !== "pro_forma") {
    return;
  }

  const key = idempotencyForInvoice(inv.invoiceNumber, "payment");
  if (await registerImportExists(organizationId, key)) {
    stats.skippedRegisterDuplicates += 1;
    return;
  }
  await createRegisterTransaction(organizationId, session, {
    kind: "payment",
    paymentMethod: inv.paymentMethod,
    amountCents: registerCents,
    counterpartyName: inv.buyerName,
    invoiceReference: inv.invoiceNumber,
    salesAgentName: inv.salesAgentName || undefined,
    purpose: "Pro-Data sales import",
    notes: `Imported from Pro-Data transaction book (${inv.paymentMethodRaw || inv.paymentMethod})`,
    recordedAt: `${inv.transactionDate}T12:00:00.000Z`,
    idempotencyKey: key,
  });
  stats.registerPaymentsCreated += 1;
}

export async function commitProDataFinanceImport(
  organizationId: number,
  session: SessionUser,
  buffer: Buffer,
  fileName: string,
  options?: {
    syncRegisterPayments?: boolean;
    settlementOverrides?: ProDataInvoiceSettlementOverride[];
  }
): Promise<{
  analysis: ProDataImportAnalysis;
  result: CommitProDataImportResult;
  importConflicts: InvoiceNumberConflict[];
}> {
  let analysis = parseProDataTransactionBook(buffer, fileName);
  if (options?.settlementOverrides?.length) {
    analysis = applySettlementOverrides(
      analysis,
      options.settlementOverrides
    );
  }
  const syncRegister = options?.syncRegisterPayments !== false;
  const db = await getControlPlaneDb();
  const ts = new Date().toISOString();

  const stored = await listProDataFinanceInvoices(organizationId);
  const importConflicts = mergeInvoiceConflicts(
    analysis.invoiceConflicts ?? [],
    detectStoredImportConflicts(analysis.invoices, stored)
  );

  const batchRows = await db
    .insert(financeProdataImportBatches)
    .values({
      organizationId,
      fileName,
      sheetName: analysis.sheetName,
      rowCount: analysis.rowCount,
      invoiceCount: analysis.invoices.length,
      dateFrom: analysis.dateFrom,
      dateTo: analysis.dateTo,
      summaryJson: JSON.stringify({
        byCategory: analysis.byCategory,
        paymentsDetected: analysis.paymentsDetected,
        openSalesCount: analysis.openSalesCount,
        invoiceConflicts: importConflicts,
      }),
      importedByAdminId:
        session.role === "admin" ? session.adminId : undefined,
      createdAt: ts,
    })
    .returning({ id: financeProdataImportBatches.id });

  const batchId = batchRows[0]?.id;
  if (!batchId) throw new Error("Could not create import batch.");

  const result: CommitProDataImportResult = {
    batchId,
    invoicesUpserted: 0,
    registerPaymentsCreated: 0,
    registerCreditsCreated: 0,
    skippedRegisterDuplicates: 0,
  };

  for (const inv of analysis.invoices) {
    if (
      settlementStatusRequiresAmount(inv.settlementStatus) &&
      (inv.paidAmountCents == null || inv.paidAmountCents <= 0)
    ) {
      throw new Error(
        `Invoice ${inv.invoiceNumber}: enter paid amount for partial settlement.`
      );
    }
    await upsertProDataInvoice(
      organizationId,
      batchId,
      inv,
      ts,
      session,
      fileName
    );
    result.invoicesUpserted += 1;
    if (syncRegister) {
      try {
        await importRegisterLineForInvoice(
          organizationId,
          session,
          inv,
          result
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/duplicate|idempotency/i.test(msg)) {
          result.skippedRegisterDuplicates += 1;
          continue;
        }
        throw err;
      }
    }
  }

  return { analysis, result, importConflicts };
}

export async function listInvoiceConflictsForBusinessDay(
  organizationId: number,
  businessDay: string
): Promise<InvoiceNumberConflict[]> {
  const day = normalizeBusinessDay(businessDay);
  if (!day) return [];

  const db = await getControlPlaneDb();
  const batches = await db
    .select()
    .from(financeProdataImportBatches)
    .where(eq(financeProdataImportBatches.organizationId, organizationId));

  const fromBatches: InvoiceNumberConflict[] = [];
  for (const batch of batches) {
    const createdDay = batch.createdAt.slice(0, 10);
    const spansDay =
      createdDay === day ||
      (batch.dateFrom &&
        batch.dateTo &&
        batch.dateFrom <= day &&
        batch.dateTo >= day);
    if (!spansDay || !batch.summaryJson) continue;
    try {
      const parsed = JSON.parse(batch.summaryJson) as {
        invoiceConflicts?: InvoiceNumberConflict[];
      };
      if (parsed.invoiceConflicts?.length) {
        fromBatches.push(...parsed.invoiceConflicts);
      }
    } catch {
      /* ignore */
    }
  }

  return mergeInvoiceConflicts(fromBatches);
}
