import { NextRequest, NextResponse } from "next/server";
import { getReportData } from "@/lib/services/orders";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const report = await getReportData({
    dateFrom: sp.get("dateFrom") ?? undefined,
    dateTo: sp.get("dateTo") ?? undefined,
    hourFrom: sp.get("hourFrom") ? Number(sp.get("hourFrom")) : undefined,
    hourTo: sp.get("hourTo") ? Number(sp.get("hourTo")) : undefined,
    employeeId: sp.get("employeeId") ? Number(sp.get("employeeId")) : undefined,
    pickerId: sp.get("pickerId") ? Number(sp.get("pickerId")) : undefined,
    driverId: sp.get("driverId") ? Number(sp.get("driverId")) : undefined,
  });
  return NextResponse.json(report);
}
