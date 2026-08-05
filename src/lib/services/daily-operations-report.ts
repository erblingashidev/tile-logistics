import { orderWorkDate, todayDateString } from "@/lib/delivery-schedule";
import type { ExportOrder } from "@/lib/export/order-rows";
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

function isPartial(order: ExportOrder): boolean {
  if (order.status === "partially_delivered") return true;
  const shipment = "shipment" in order ? order.shipment : undefined;
  return Boolean(shipment?.hasPartialShipments || shipment?.isPartialLoad);
}

function datePrefix(iso?: string | null): string {
  return iso?.trim().slice(0, 10) ?? "";
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
    if (datePrefix(proof.capturedAt) === reportDate) return true;
  }

  if (
    order.status === "delivered" &&
    datePrefix(order.updatedAt) === reportDate
  ) {
    return true;
  }

  return false;
}

export function completedOnReportDate(
  order: ExportOrder,
  reportDate: string
): boolean {
  if (!isComplete(order) || order.status === "cancelled") return false;
  const delivered = order.proofs?.find((p) => p.phase === "delivered");
  if (datePrefix(delivered?.capturedAt) === reportDate) return true;
  if (order.status === "delivered" && datePrefix(order.updatedAt) === reportDate) {
    return true;
  }
  return false;
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
  const delayed = orders.filter((o) => {
    const workDate = orderWorkDate(o);
    return (
      !isComplete(o) && o.status !== "cancelled" && workDate < date
    );
  });
  const partial = orders.filter(isPartial);
  const scheduled = orders.filter((o) => orderWorkDate(o) === date);

  const waitingValue = waiting.reduce((s, o) => s + (o.price ?? 0), 0);
  const completedValue = completed.reduce((s, o) => s + (o.price ?? 0), 0);
  const completedTodayValue = completedToday.reduce(
    (s, o) => s + (o.price ?? 0),
    0
  );
  const totalValue = orders.reduce((s, o) => s + (o.price ?? 0), 0);

  return {
    reportDate: date,
    orders,
    stats: {
      total: orders.length,
      waiting: waiting.length,
      completed: completed.length,
      completedToday: completedToday.length,
      delayed: delayed.length,
      partial: partial.length,
      scheduled: scheduled.length,
      waitingValue,
      completedValue,
      completedTodayValue,
      totalValue,
    },
  };
}
