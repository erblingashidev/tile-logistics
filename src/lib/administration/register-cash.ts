/** Whether a ledger line changes physical cash in the drawer. */
export function transactionAffectsCashDrawer(tx: {
  kind: string;
  paymentMethod: string | null;
}): boolean {
  if (tx.paymentMethod === "cash") return true;
  if (tx.kind === "expense" && tx.paymentMethod == null) return true;
  return false;
}

export type CashVarianceStatus = "balanced" | "over" | "short";

export function cashVarianceStatus(varianceCents: number): CashVarianceStatus {
  if (varianceCents === 0) return "balanced";
  return varianceCents > 0 ? "over" : "short";
}

export function formatCashVarianceLabel(
  varianceCents: number,
  formatMoney: (cents: number) => string
): string {
  const status = cashVarianceStatus(varianceCents);
  if (status === "balanced") return "Balanced — matches expected";
  const abs = formatMoney(Math.abs(varianceCents));
  return status === "over" ? `${abs} over (+)` : `${abs} short (−)`;
}
