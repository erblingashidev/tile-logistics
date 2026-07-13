import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/api-guard";
import {
  getDispatchPrintSheet,
  parseDispatchPrintFilters,
} from "@/lib/services/dispatch-print";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  try {
    const sheet = await getDispatchPrintSheet(
      parseDispatchPrintFilters(request.nextUrl.searchParams)
    );
    return NextResponse.json(sheet, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[api/dispatch/print GET]", err);
    const message =
      err instanceof Error ? err.message : "Failed to load dispatch print sheet";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
