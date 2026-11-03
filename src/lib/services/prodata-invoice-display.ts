import type { AdminPaymentMethod } from "@/lib/administration/constants";
import type { ProDataInvoiceAggregate } from "@/lib/administration/prodata-transaction-book";
import type { ProDataFinanceInvoiceRow } from "@/lib/services/finance-prodata-import";

export function proDataFinanceRowToAggregate(
  row: ProDataFinanceInvoiceRow
): ProDataInvoiceAggregate {
  return {
    invoiceNumber: row.invoiceNumber,
    documentCategory: row.documentCategory,
    transactionDate: row.transactionDate,
    buyerName: row.buyerName,
    salesAgentName: row.salesAgentName ?? "",
    netValueEuros: row.netValueCents / 100,
    netValueCents: row.netValueCents,
    lineCount: row.lineCount,
    paymentMethodRaw: row.paymentMethodRaw ?? "",
    paymentMethod: (row.paymentMethod as AdminPaymentMethod | null) ?? null,
    settlementStatus: row.settlementStatus,
    paidAmountCents: row.paidAmountCents,
    productSample: "",
  };
}
