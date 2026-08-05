import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getDailyReportOrders } from "@/lib/services/daily-operations-report";
import { buildPickerPerformanceRows } from "@/lib/export/daily-report-rows";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const date =
      request.nextUrl.searchParams.get("date")?.trim() ||
      new Date().toISOString().slice(0, 10);

    const { orders, stats } = await getDailyReportOrders(date);
    const pickerRows = buildPickerPerformanceRows(orders, date);

    return NextResponse.json({
      reportDate: date,
      orderCount: stats.total,
      completed: stats.completed,
      inProgress: stats.waiting,
      completedToday: stats.completedToday,
      delayed: stats.delayed,
      partial: stats.partial,
      scheduled: stats.scheduled,
      totalValue: stats.totalValue,
      waitingValue: stats.waitingValue,
      completedValue: stats.completedValue,
      completedTodayValue: stats.completedTodayValue,
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
