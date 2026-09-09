import { orderWorkDate, todayDateString } from "@/lib/delivery-schedule";
import type { ExportOrder } from "@/lib/export/order-rows";
import { getDailyReportReturns } from "@/lib/services/customer-returns";
import { listOrders } from "@/lib/services/orders";

export type DailyOrderBucket =
  | "scheduled"
  | "waiting"
  | "completed_today"
  | "delayed"
  | "partial";

function isComplete(order: ExportOrder): boolean {
  return order.status === "delivered" || order.status === "cancelled";
}

export function isDelayedOnReportDate(
  order: ExportOrder,
  reportDate: string
): boolean {
  if (isComplete(order) || order.status === "cancelled") return false;
  return orderWorkDate(order) < reportDate;
}

function isPartial(order: ExportOrder): boolean {
  if (order.status === "partially_delivered") return true;
  const shipment = "shipment" in order ? order.shipment : undefined;
  return Boolean(shipment?.hasPartialShipments || shipment?.isPartialLoad);
}

function datePrefix(iso?: string | null): string {
  return iso?.trim().slice(0, 10) ?? "";
}

function stampedCompletionDate(order: ExportOrder): string {
  const delivered = order.proofs?.find((p) => p.phase === "delivered");
  if (datePrefix(delivered?.capturedAt)) return datePrefix(delivered?.capturedAt);
  if (order.status === "delivered") return datePrefix(order.updatedAt);
  return "";
}

/** Delayed completions stay on the scheduled work day, not the day they were recorded. */
export function effectiveCompletionDate(order: ExportOrder): string {
  const stamped = stampedCompletionDate(order);
  if (!stamped) return "";
  const workDate = orderWorkDate(order);
  if (workDate && workDate < stamped) return workDate;
  return stamped;
}

export function activityOnReportDate(
  order: ExportOrder,
  reportDate: string
): boolean {
  if (datePrefix(order.createdAt) === reportDate) return true;
  if (datePrefix(order.assignment?.assignedAt) === reportDate) return true;

  const staffList = [
    order.staff?.picker,
    order.staff?.driver,
    order.staff?.groupLeader,
    ...(order.staff?.staff ?? []),
  ];
  for (const member of staffList) {
    if (!member) continue;
    const assignedAt =
      "assignedAt" in member ? member.assignedAt : undefined;
    if (datePrefix(assignedAt) === reportDate) return true;
  }

  for (const proof of order.proofs ?? []) {
    const proofDate = datePrefix(proof.capturedAt);
    if (proofDate !== reportDate) continue;
    if (
      (proof.phase === "delivered" || proof.phase === "partial_delivery") &&
      orderWorkDate(order) < proofDate
    ) {
      continue;
    }
    return true;
  }

  if (order.status === "delivered") {
    const completionDate = effectiveCompletionDate(order);
    if (completionDate === reportDate) return true;
  }

  return false;
}

export function completedOnReportDate(
  order: ExportOrder,
  reportDate: string
): boolean {
  if (!isComplete(order) || order.status === "cancelled") return false;
  return effectiveCompletionDate(order) === reportDate;
}

export function classifyDailyOrder(
  order: ExportOrder,
  reportDate: string
): DailyOrderBucket[] {
  const buckets: DailyOrderBucket[] = [];
  const workDate = orderWorkDate(order);
  const complete = isComplete(order);
  const open = !complete && order.status !== "cancelled";

  if (workDate === reportDate) buckets.push("scheduled");
  if (open) buckets.push("waiting");
  if (completedOnReportDate(order, reportDate)) buckets.push("completed_today");
  if (open && workDate < reportDate) buckets.push("delayed");
  if (isPartial(order)) buckets.push("partial");

  return buckets;
}

export function orderIncludedInDailyReport(
  order: ExportOrder,
  reportDate: string
): boolean {
  if (activityOnReportDate(order, reportDate)) return true;
  if (!isComplete(order) && order.status !== "cancelled") return true;
  if (completedOnReportDate(order, reportDate)) return true;
  if (orderWorkDate(order) === reportDate) return true;
  return false;
}

export async function getDailyReportOrders(reportDate?: string) {
  const date = reportDate?.trim() || todayDateString();
  const allOrders = await listOrders({ hideDelivered: false });
  const orders = allOrders.filter((order) =>
    orderIncludedInDailyReport(order, date)
  );

  const waiting = orders.filter(
    (o) => !isComplete(o) && o.status !== "cancelled"
  );
  const completed = orders.filter((o) => o.status === "delivered");
  const completedToday = orders.filter((o) =>
    completedOnReportDate(o, date)
  );
  const delayed = orders
    .filter((o) => isDelayedOnReportDate(o, date))
    .sort((a, b) => {
      const byDate = orderWorkDate(a).localeCompare(orderWorkDate(b));
      if (byDate !== 0) return byDate;
      return a.invoiceNumber.localeCompare(b.invoiceNumber, "sq", {
        numeric: true,
      });
    });
  const dayOrders = orders.filter((o) => !isDelayedOnReportDate(o, date));
  const partial = orders.filter(isPartial);
  const scheduled = orders.filter((o) => orderWorkDate(o) === date);

  const scheduledWaiting = scheduled.filter(
    (o) => !isComplete(o) && o.status !== "cancelled"
  );
  const scheduledCompleted = scheduled.filter(
    (o) => o.status === "delivered"
  );
  const waitingValue = waiting.reduce((s, o) => s + (o.price ?? 0), 0);
  const completedValue = completed.reduce((s, o) => s + (o.price ?? 0), 0);
  const completedTodayValue = completedToday.reduce(
    (s, o) => s + (o.price ?? 0),
    0
  );
  const scheduledValue = scheduled.reduce((s, o) => s + (o.price ?? 0), 0);
  const delayedValue = delayed.reduce((s, o) => s + (o.price ?? 0), 0);
  const totalValue = orders.reduce((s, o) => s + (o.price ?? 0), 0);
  const scheduledCount = scheduled.length;
  const delayedCount = delayed.length;
  const completionRate =
    scheduledCount > 0
      ? Math.round((scheduledCompleted.length / scheduledCount) * 100)
      : 0;
  const delayedShareOfOpen =
    waiting.length > 0
      ? Math.round((delayedCount / waiting.length) * 100)
      : 0;

  const returns = await getDailyReportReturns(date);

  return {
    reportDate: date,
    orders,
    dayOrders,
    delayedOrders: delayed,
    scheduledOrders: scheduled,
    returns,
    stats: {
      /** All rows included in the report (day + delayed backlog). */
      total: orders.length,
      /** Orders scheduled for this report date (the real “that day” count). */
      scheduled: scheduledCount,
      scheduledWaiting: scheduledWaiting.length,
      scheduledCompleted: scheduledCompleted.length,
      waiting: waiting.length,
      completed: completed.length,
      completedToday: completedToday.length,
      delayed: delayedCount,
      partial: partial.length,
      waitingValue,
      completedValue,
      completedTodayValue,
      scheduledValue,
      delayedValue,
      totalValue,
      completionRate,
      delayedShareOfOpen,
    },
  };
}
