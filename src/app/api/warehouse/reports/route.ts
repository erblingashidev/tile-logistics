import { NextRequest, NextResponse } from "next/server";
import { runApiCompanyAdmin } from "@/lib/auth/api-guard";
import { listWarehouseReportsForWeek } from "@/lib/services/warehouse-reports";
import { formatReportWeek, previousReportWeeks } from "@/lib/warehouse-report-week";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return runApiCompanyAdmin(async () => {
    const week =
      request.nextUrl.searchParams.get("week")?.trim() ||
      formatReportWeek(new Date());

    const data = await listWarehouseReportsForWeek(week);
    return NextResponse.json({
      ...data,
      availableWeeks: previousReportWeeks(8),
    });
  });
}
