/** Client-safe business day helpers (no server/DB imports). */

export function normalizeBusinessDay(
  raw: string | null | undefined
): string | null {
  const d = (raw ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return d;
}

export function todayBusinessDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export function invoiceMatchesBusinessDay(
  transactionDate: string | null | undefined,
  orderDate: string | null | undefined,
  day: string
): boolean {
  const pro = normalizeBusinessDay(transactionDate);
  if (pro === day) return true;
  const ord = normalizeBusinessDay(orderDate);
  return ord === day;
}
