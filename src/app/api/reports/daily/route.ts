import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getDailyReportOrders } from "@/lib/services/daily-operations-report";
import {
  buildPickerPerformanceRows,
  orderPipelineLabel,
} from "@/lib/export/daily-report-rows";
import { orderWorkDate } from "@/lib/delivery-schedule";
import { daysBetweenDates } from "@/lib/export/report-dates";
import type { ExportOrder } from "@/lib/export/order-rows";

export const runtime = "nodejs";

function mapOrderRow(order: ExportOrder, date: string) {
  const deliveryDate = orderWorkDate(order);
  const delayed =
    order.status !== "delivered" &&
    order.status !== "cancelled" &&
    deliveryDate < date;
  return {
    id: order.id,
    invoiceNumber: order.invoiceNumber,
    customerName: order.customerName,
    location: order.city || order.region || order.location,
    deliveryDate,
    daysOverdue: delayed ? daysBetweenDates(deliveryDate, date) : 0,
    delayed,
    pipeline: orderPipelineLabel(order, date),
    status:
      "deliveryStageLabel" in order && order.deliveryStageLabel
        ? order.deliveryStageLabel
        : order.status.replace(/_/g, " "),
    pallets: order.totalPallets,
    value: order.price ?? 0,
    picker: order.staff?.picker?.employeeName ?? "",
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const date =
      request.nextUrl.searchParams.get("date")?.trim() ||
      new Date().toISOString().slice(0, 10);

    const { orders, dayOrders, delayedOrders, scheduledOrders, stats } =
      await getDailyReportOrders(date);
    const pickerRows = buildPickerPerformanceRows(orders, date);

    return NextResponse.json({
      reportDate: date,
      /** @deprecated use scheduled — total includes delayed backlog */
      orderCount: stats.scheduled,
      totalInReport: stats.total,
      completed: stats.completed,
      inProgress: stats.waiting,
      completedToday: stats.completedToday,
      delayed: stats.delayed,
      partial: stats.partial,
      scheduled: stats.scheduled,
      scheduledWaiting: stats.scheduledWaiting,
      scheduledCompleted: stats.scheduledCompleted,
      completionRate: stats.completionRate,
      delayedShareOfOpen: stats.delayedShareOfOpen,
      totalValue: stats.totalValue,
      waitingValue: stats.waitingValue,
      completedValue: stats.completedValue,
      completedTodayValue: stats.completedTodayValue,
      scheduledValue: stats.scheduledValue,
      delayedValue: stats.delayedValue,
      dayOrders: dayOrders.map((o) => mapOrderRow(o, date)),
      scheduledOrders: scheduledOrders.map((o) => mapOrderRow(o, date)),
      delayedOrders: delayedOrders.map((o) => mapOrderRow(o, date)),
      pickers: pickerRows.map((row) => ({
        name: row.Picker,
        orders: row.Orders,
        assignedToday: row["Assigned today"],
        completed: row.Completed,
        completedToday: row["Completed today"],
        waiting: row.Waiting,
        delayed: row.Delayed,
        partial: row.Partial,
        valueCompleted: row["Value completed (€)"],
        valueCompletedToday: row["Value completed today (€)"],
        valueWaiting: row["Value waiting (€)"],
        firstAssigned: row["First assigned"],
        lastCompleted: row["Last completed"],
      })),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
