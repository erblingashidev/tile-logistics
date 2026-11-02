/** Payment / settlement method on a register transaction. */
export const ADMIN_PAYMENT_METHODS = [
  { id: "cash", label: "Cash" },
  { id: "card", label: "Card" },
  { id: "bank_transfer", label: "Bank transfer" },
  { id: "unpaid", label: "Unpaid / on account" },
  { id: "other", label: "Other" },
] as const;

export type AdminPaymentMethod = (typeof ADMIN_PAYMENT_METHODS)[number]["id"];

export const ADMIN_TRANSACTION_KINDS = [
  { id: "payment", label: "Payment (income)" },
  { id: "expense", label: "Expense (payout)" },
  { id: "return_refund", label: "Return / refund" },
  { id: "adjustment", label: "Adjustment" },
] as const;

export type AdminTransactionKind = (typeof ADMIN_TRANSACTION_KINDS)[number]["id"];

export const ADMIN_EDIT_REQUEST_STATUSES = [
  "pending",
  "approved",
  "rejected",
] as const;

export type AdminEditRequestStatus =
  (typeof ADMIN_EDIT_REQUEST_STATUSES)[number];

export const ADMIN_REGISTER_STATUSES = ["open", "closed"] as const;

/** Standard expense buckets for reporting and consistency. */
export const ADMIN_EXPENSE_CATEGORIES = [
  { id: "fuel", label: "Fuel & transport" },
  { id: "utilities", label: "Utilities" },
  { id: "supplies", label: "Office / warehouse supplies" },
  { id: "maintenance", label: "Maintenance & repairs" },
  { id: "payroll_advance", label: "Payroll advance / cash to staff" },
  { id: "vendor", label: "Vendor / supplier payment" },
  { id: "bank_fees", label: "Bank & card fees" },
  { id: "other", label: "Other expense" },
] as const;

export type AdminExpenseCategory =
  (typeof ADMIN_EXPENSE_CATEGORIES)[number]["id"];

export function isAdminExpenseCategory(
  value: string
): value is AdminExpenseCategory {
  return ADMIN_EXPENSE_CATEGORIES.some((c) => c.id === value);
}

export function expenseCategoryLabel(id: string | null | undefined): string {
  if (!id) return "—";
  return (
    ADMIN_EXPENSE_CATEGORIES.find((c) => c.id === id)?.label ??
    id.replace(/_/g, " ")
  );
}

export function isAdminPaymentMethod(value: string): value is AdminPaymentMethod {
  return ADMIN_PAYMENT_METHODS.some((m) => m.id === value);
}

export function isAdminTransactionKind(value: string): value is AdminTransactionKind {
  return ADMIN_TRANSACTION_KINDS.some((k) => k.id === value);
}
