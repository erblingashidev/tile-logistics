export type DeliveryTimePreference = "flexible" | "morning" | "afternoon";

export const DELIVERY_TIME_PREFERENCES: DeliveryTimePreference[] = [
  "flexible",
  "morning",
  "afternoon",
];

export const DELIVERY_TIME_PREFERENCE_LABELS: Record<
  DeliveryTimePreference,
  string
> = {
  flexible: "Whenever we can (no preference)",
  morning: "Early in the morning",
  afternoon: "Later in the day",
};

export function normalizeDeliveryTimePreference(
  value?: string | null
): DeliveryTimePreference {
  if (value === "morning" || value === "afternoon") return value;
  return "flexible";
}

export function todayDateString(asOf = new Date()): string {
  return asOf.toISOString().slice(0, 10);
}

export function isOrderReadyToShip(
  order: { requestedDeliveryDate?: string | null },
  asOfDate?: string
): boolean {
  if (!order.requestedDeliveryDate) return true;
  const asOf = asOfDate ?? todayDateString();
  return order.requestedDeliveryDate <= asOf;
}

export function formatDeliverySchedule(order: {
  requestedDeliveryDate?: string | null;
  deliveryTimePreference?: string | null;
}): string {
  const pref = normalizeDeliveryTimePreference(order.deliveryTimePreference);
  if (!order.requestedDeliveryDate) {
    if (pref === "flexible") return "Ship when ready";
    return `Ship when ready · ${DELIVERY_TIME_PREFERENCE_LABELS[pref]}`;
  }
  const prefSuffix =
    pref !== "flexible" ? ` · ${DELIVERY_TIME_PREFERENCE_LABELS[pref]}` : "";
  return `Deliver on ${order.requestedDeliveryDate}${prefSuffix}`;
}

export function deliveryScheduleBadgeTone(order: {
  requestedDeliveryDate?: string | null;
}): "slate" | "amber" | "blue" {
  if (!order.requestedDeliveryDate) return "slate";
  if (isOrderReadyToShip(order)) return "blue";
  return "amber";
}

export function validateRequestedDeliveryDate(
  orderDate: string,
  requestedDeliveryDate?: string | null
): string | null {
  if (!requestedDeliveryDate?.trim()) return null;
  if (requestedDeliveryDate < orderDate) {
    return "Requested delivery date cannot be before the order date.";
  }
  return null;
}
