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
