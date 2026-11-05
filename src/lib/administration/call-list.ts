type RegisterLine = {
  kind: string;
  paymentMethod: string | null;
  invoiceReference: string | null;
  recordedAt: string;
};

type InvoiceLine = {
  balanceDueCents: number;
  orderDate: string | null;
  orderStatus: string | null;
};

/** Days with no register payment and no activity before a client enters the call list. */
export const CALL_LIST_STALE_DAYS = 2;

export const CALL_REASON_STALE =
  "No payment or update for 2+ days" as const;
export const CALL_REASON_UNPAID_REGISTER =
  "Unpaid / on account recorded in register" as const;
export const CALL_REASON_DELIVERED_UNPAID =
  "Delivered order not fully paid" as const;

function daysSinceIso(isoDate: string): number {
  const start = new Date(isoDate.slice(0, 10) + "T12:00:00");
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diff = today.getTime() - start.getTime();
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

export function buildClientCallReasons(input: {
  balanceDueCents: number;
  lastActivityAt: string | null;
  registerLines: RegisterLine[];
  invoices: InvoiceLine[];
}): string[] {
  const reasons: string[] = [];
  if (input.balanceDueCents <= 0) return reasons;

  let lastPaymentAt: string | null = null;
  for (const line of input.registerLines) {
    if (line.kind !== "payment") continue;
    if (!lastPaymentAt || line.recordedAt > lastPaymentAt) {
      lastPaymentAt = line.recordedAt;
    }
  }

  let earliestOpenDate: string | null = null;
  for (const inv of input.invoices) {
    if (inv.balanceDueCents <= 0 || !inv.orderDate) continue;
    if (!earliestOpenDate || inv.orderDate < earliestOpenDate) {
      earliestOpenDate = inv.orderDate;
    }
  }

  const changeAnchor = input.lastActivityAt ?? earliestOpenDate;
  const paymentAnchor = lastPaymentAt ?? earliestOpenDate;
  if (!changeAnchor || !paymentAnchor) return reasons;

  const daysSinceChange = daysSinceIso(changeAnchor);
  const daysSincePayment = daysSinceIso(paymentAnchor);
  const stalled =
    daysSinceChange >= CALL_LIST_STALE_DAYS &&
    daysSincePayment >= CALL_LIST_STALE_DAYS;

  if (!stalled) return reasons;

  reasons.push(CALL_REASON_STALE);

  const unpaidWithInvoice = input.registerLines.some(
    (line) =>
      line.kind === "payment" &&
      line.paymentMethod === "unpaid" &&
      Boolean(line.invoiceReference?.trim())
  );
  if (unpaidWithInvoice) reasons.push(CALL_REASON_UNPAID_REGISTER);

  const deliveredUnpaid = input.invoices.some(
    (inv) =>
      inv.balanceDueCents > 0 &&
      (inv.orderStatus === "delivered" || inv.orderStatus === "completed")
  );
  if (deliveredUnpaid) reasons.push(CALL_REASON_DELIVERED_UNPAID);

  return reasons;
}
