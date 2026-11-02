import type { AdminTransactionKind } from "@/lib/administration/constants";

export function parsePositiveAmountCents(raw: number): number {
  if (!Number.isFinite(raw)) {
    throw new Error("Amount must be a valid number.");
  }
  const cents = Math.round(raw);
  if (cents <= 0) {
    throw new Error("Amount must be greater than zero.");
  }
  if (cents > 999_999_999_99) {
    throw new Error("Amount is too large.");
  }
  return cents;
}

export function parseAmountCentsFromEuros(raw: string | number): number {
  const n =
    typeof raw === "number" ? raw : parseFloat(String(raw || "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("Enter a valid amount greater than zero.");
  }
  return parsePositiveAmountCents(Math.round(n * 100));
}

export function normalizeInvoiceReference(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function invoiceReferencesMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const left = normalizeInvoiceReference(a).toLowerCase();
  const right = normalizeInvoiceReference(b).toLowerCase();
  return left.length > 0 && left === right;
}

export function kindRequiresPaymentMethod(kind: AdminTransactionKind): boolean {
  return kind === "payment" || kind === "return_refund";
}

const INCOME_LIKE_KINDS = new Set<AdminTransactionKind>([
  "payment",
  "return_refund",
]);

export function isIncomeLikeRegisterKind(
  kind: string
): kind is AdminTransactionKind {
  return INCOME_LIKE_KINDS.has(kind as AdminTransactionKind);
}

/** Every register line must cite an invoice or receipt number for audit and follow-up. */
export function assertRegisterInvoiceReference(
  invoiceReference: string | null | undefined
) {
  if (!invoiceReference?.trim()) {
    throw new Error(
      "Invoice or receipt number is required on every register entry."
    );
  }
}

/** Payment and refunds must identify the customer and invoice. */
export function assertPaymentIncomeRequiredFields(
  kind: string,
  counterpartyName: string | null | undefined,
  invoiceReference: string | null | undefined
) {
  if (!isIncomeLikeRegisterKind(kind)) return;
  if (!counterpartyName?.trim()) {
    throw new Error(
      "Customer name is required for payment and refund entries."
    );
  }
  if (!invoiceReference?.trim()) {
    throw new Error(
      "Invoice number is required for payment and refund entries."
    );
  }
}

export function assertSalesAgentRequired(
  kind: string,
  salesEmployeeId: number | null | undefined
) {
  if (!isIncomeLikeRegisterKind(kind)) return;
  if (!salesEmployeeId) {
    throw new Error(
      "Sales agent is required for payment and refund entries."
    );
  }
}

export function invoiceRowHasSalesAgent(row: {
  salesEmployeeId: number | null;
  salesAgentName: string | null;
}): boolean {
  return (
    row.salesEmployeeId != null || Boolean(row.salesAgentName?.trim())
  );
}
