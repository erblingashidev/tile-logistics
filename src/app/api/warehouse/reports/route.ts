import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listWarehouseReportsForWeek } from "@/lib/services/warehouse-reports";
import { formatReportWeek, previousReportWeeks } from "@/lib/warehouse-report-week";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const week =
      request.nextUrl.searchParams.get("week")?.trim() ||
      formatReportWeek(new Date());

    const data = await listWarehouseReportsForWeek(week);
    return NextResponse.json({
      ...data,
      availableWeeks: previousReportWeeks(8),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
