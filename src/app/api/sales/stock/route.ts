import { NextResponse } from "next/server";
import { requireSalesStaffSession } from "@/lib/auth/api-guard";
import { listStockForSalesPortal } from "@/lib/services/sales-portal";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireSalesStaffSession();
  if (!auth.ok) return auth.response;

  try {
    const stock = await listStockForSalesPortal(auth.session);
    return NextResponse.json(stock, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load stock";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
