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
  const year = asOf.getFullYear();
  const month = String(asOf.getMonth() + 1).padStart(2, "0");
  const day = String(asOf.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDaysToDateString(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const base = new Date(year, month - 1, day);
  base.setDate(base.getDate() + days);
  return todayDateString(base);
}

/** Warehouse work-day bucket: scheduled delivery date, else invoice order date. */
export function orderWorkDate(order: {
  requestedDeliveryDate?: string | null;
  orderDate: string;
}): string {
  return order.requestedDeliveryDate?.trim() || order.orderDate;
}

const COMPLETION_STATUSES = new Set(["delivered", "partially_delivered"]);
const COMPLETION_PROOF_PHASES = new Set(["delivered", "partial_delivery"]);

/**
 * Late status updates keep the scheduled work day. An order still on
 * yesterday's (or an older) list is completed on that date — reschedule
 * to today first to complete it today.
 */
export function statusChangeTimestamp(
  order: {
    requestedDeliveryDate?: string | null;
    orderDate: string;
  },
  status: string,
  asOf = new Date()
): string {
  const nowIso = asOf.toISOString();
  if (!COMPLETION_STATUSES.has(status)) return nowIso;
  const today = todayDateString(asOf);
  const workDate = orderWorkDate(order);
  if (workDate && workDate < today) {
    return `${workDate}${nowIso.slice(10)}`;
  }
  return nowIso;
}

export function proofCapturedAtTimestamp(
  order: {
    requestedDeliveryDate?: string | null;
    orderDate: string;
  },
  phase: string,
  asOf = new Date()
): string {
  if (!COMPLETION_PROOF_PHASES.has(phase)) return asOf.toISOString();
  return statusChangeTimestamp(
    order,
    phase === "partial_delivery" ? "partially_delivered" : "delivered",
    asOf
  );
}

export function pastWorkDateCompletionNote(
  order: {
    requestedDeliveryDate?: string | null;
    orderDate: string;
  },
  asOf = new Date()
): string | null {
  const today = todayDateString(asOf);
  const workDate = orderWorkDate(order);
  if (!workDate || workDate >= today) return null;
  const yesterday = addDaysToDateString(today, -1);
  const label = workDate === yesterday ? "yesterday" : workDate;
  return `This order is still on the ${label} list. Completing it will count as ${label}. Reschedule to today first if it was actually finished today.`;
}

export type WorkDayFilter =
  | "today"
  | "tomorrow"
  | "yesterday"
  | "overdue"
  | "all"
  | "date";

const WORK_DAY_VALUES: WorkDayFilter[] = [
  "today",
  "tomorrow",
  "yesterday",
  "overdue",
  "all",
  "date",
];

export function parseWorkDayFilter(
  value: string | null | undefined
): WorkDayFilter | undefined {
  if (value && WORK_DAY_VALUES.includes(value as WorkDayFilter)) {
    return value as WorkDayFilter;
  }
  return undefined;
}

export function workDayFilterLabel(
  workDay: WorkDayFilter,
  asOfDate?: string
): string {
  const asOf = todayDateString();
  switch (workDay) {
    case "today":
      return `Today (${asOf})`;
    case "tomorrow":
      return `Tomorrow (${addDaysToDateString(asOf, 1)})`;
    case "yesterday":
      return `Yesterday open (${addDaysToDateString(asOf, -1)})`;
    case "overdue":
      return "Overdue";
    case "all":
      return "All days";
    case "date":
      return asOfDate?.trim() ? asOfDate : "Selected date";
    default:
      return workDay;
  }
}

export function matchesWorkDay(
  order: {
    requestedDeliveryDate?: string | null;
    orderDate: string;
    deliveryStage?: string;
    status?: string;
  },
  workDay: WorkDayFilter,
  asOfDate?: string
): boolean {
  if (workDay === "all") return true;
  const asOf = todayDateString();
  const workDate = orderWorkDate(order);
  const stage = order.deliveryStage ?? order.status ?? "pending";
  const finished = stage === "delivered" || stage === "cancelled";

  if (workDay === "today") return workDate === asOf;
  if (workDay === "tomorrow") {
    return workDate === addDaysToDateString(asOf, 1);
  }
  if (workDay === "date") {
    const target = asOfDate?.trim();
    return Boolean(target && workDate === target);
  }
  if (workDay === "yesterday") {
    return workDate === addDaysToDateString(asOf, -1) && !finished;
  }
  if (workDay === "overdue") {
    return workDate < asOf && !finished;
  }
  return true;
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
