import { NextRequest, NextResponse } from "next/server";
import { listLogs } from "@/lib/services/orders";
import type { LogCategory } from "@/lib/log-messages";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const category = sp.get("category") as LogCategory | null;

  const logs = await listLogs({
    dateFrom: sp.get("dateFrom") ?? undefined,
    dateTo: sp.get("dateTo") ?? undefined,
    category: category ?? undefined,
    search: sp.get("search") ?? undefined,
    employeeId: sp.get("employeeId") ? Number(sp.get("employeeId")) : undefined,
  });
  return NextResponse.json(logs);
}
