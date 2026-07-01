import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listWarehouseZonesWithLeaders } from "@/lib/services/warehouse-zones";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(await listWarehouseZonesWithLeaders());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
