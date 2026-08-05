import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getDailyReportOrders } from "@/lib/services/daily-operations-report";
import { buildGroupLeaderSummaryRows } from "@/lib/export/daily-report-rows";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const date =
      request.nextUrl.searchParams.get("date")?.trim() ||
      new Date().toISOString().slice(0, 10);

    const { orders, stats } = await getDailyReportOrders(date);
    const leaderRows = buildGroupLeaderSummaryRows(orders, date);

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
      completedTodayValue: stats.completedTodayValue,
      groupLeaders: leaderRows.map((row) => ({
        name: row["Group leader"],
        orders: row["Orders assigned"],
        completed: row.Completed,
        completedToday: row["Completed today"],
        waiting: row["Still waiting"],
        delayed: row.Delayed,
        valueTotal: row["Total value (€)"],
        valueCompleted: row["Value completed (€)"],
      })),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
