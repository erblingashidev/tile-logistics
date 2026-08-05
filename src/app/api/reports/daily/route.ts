import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listOrders } from "@/lib/services/orders";
import { orderWorkDate } from "@/lib/delivery-schedule";
import { buildGroupLeaderSummaryRows } from "@/lib/export/daily-report-rows";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const date =
      request.nextUrl.searchParams.get("date")?.trim() ||
      new Date().toISOString().slice(0, 10);

    const orders = await listOrders({
      workDay: "date",
      shipAsOfDate: date,
      hideDelivered: false,
    });

    let completed = 0;
    let delayed = 0;
    let partial = 0;
    let totalValue = 0;

    for (const order of orders) {
      totalValue += order.price ?? 0;
      const workDate = orderWorkDate(order);
      const isComplete =
        order.status === "delivered" || order.status === "cancelled";
      if (isComplete) completed += 1;
      if (
        !isComplete &&
        workDate < date &&
        order.status !== "cancelled"
      ) {
        delayed += 1;
      }
      const shipment = "shipment" in order ? order.shipment : undefined;
      if (
        order.status === "partially_delivered" ||
        shipment?.hasPartialShipments ||
        shipment?.isPartialLoad
      ) {
        partial += 1;
      }
    }

    const leaderRows = buildGroupLeaderSummaryRows(orders, date);

    return NextResponse.json({
      reportDate: date,
      orderCount: orders.length,
      completed,
      inProgress: orders.length - completed,
      delayed,
      partial,
      totalValue,
      groupLeaders: leaderRows.map((row) => ({
        name: row["Group leader"],
        orders: row["Orders on report"],
        completed: row.Completed,
        delayed: row.Delayed,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
