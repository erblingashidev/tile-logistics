export type OrderPriority = "normal" | "urgent";

const URGENT_NOTE_PATTERN =
  /\b(urgent|urgjent|asap|immediately|menjëherë|menjehere|priority|prioritet)\b/i;

export function normalizeOrderPriority(
  priority?: string | null,
  notes?: string | null
): OrderPriority {
  if (priority === "urgent") return "urgent";
  if (notes && URGENT_NOTE_PATTERN.test(notes)) return "urgent";
  return "normal";
}

export function isOrderUrgent(order: {
  priority?: string | null;
  notes?: string | null;
}): boolean {
  return normalizeOrderPriority(order.priority, order.notes) === "urgent";
}

export const ORDER_PRIORITY_LABELS: Record<OrderPriority, string> = {
  normal: "Normal",
  urgent: "Urgent",
};
