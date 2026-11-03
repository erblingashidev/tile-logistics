import { and, eq } from "drizzle-orm";
import { getControlPlaneDb } from "@/lib/db";
import {
  financeProdataImportBatches,
  financeProdataInvoices,
} from "@/lib/db/schema";
import {
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
import { createRegisterTransaction } from "@/lib/services/administration-register";

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
  patch: ProDataInvoiceSettlementOverride
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
  const ts = new Date().toISOString();
  const set: Record<string, unknown> = {
    settlementStatus: patch.settlementStatus,
    paidAmountCents: patch.paidAmountCents ?? null,
    updatedAt: ts,
  };
  if (patch.paymentMethod !== undefined) {
    set.paymentMethod = patch.paymentMethod;
  }
  const updated = await db
    .update(financeProdataInvoices)
    .set(set)
    .where(
      and(
        eq(financeProdataInvoices.organizationId, organizationId),
        eq(financeProdataInvoices.invoiceNumber, invoiceNumber.trim())
      )
    );
  if ((updated.rowsAffected ?? 0) === 0) {
    throw new Error("Invoice not found in Pro-Data import data.");
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
  ts: string
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

  if (existing[0]) {
    await db
      .update(financeProdataInvoices)
      .set(values)
      .where(eq(financeProdataInvoices.id, existing[0].id));
  } else {
    await db.insert(financeProdataInvoices).values(values);
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
): Promise<{ analysis: ProDataImportAnalysis; result: CommitProDataImportResult }> {
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
    await upsertProDataInvoice(organizationId, batchId, inv, ts);
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

  return { analysis, result };
}
