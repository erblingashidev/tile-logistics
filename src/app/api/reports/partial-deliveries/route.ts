import { NextRequest, NextResponse } from "next/server";
import { getPartialDeliveriesReport } from "@/lib/services/partial-deliveries-report";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const scopeRaw = sp.get("scope");
  const scope = scopeRaw === "all" ? "all" : "open";

  const report = await getPartialDeliveriesReport({
    dateFrom: sp.get("dateFrom") ?? undefined,
    dateTo: sp.get("dateTo") ?? undefined,
    scope,
    region: sp.get("region") ?? undefined,
    search: sp.get("search") ?? undefined,
  });

  return NextResponse.json(report, {
    headers: { "Cache-Control": "no-store" },
  });
}
