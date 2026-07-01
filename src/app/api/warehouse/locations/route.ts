import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  createWarehouseLocation,
  listLocationsWithStockSummary,
} from "@/lib/services/stock";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(await listLocationsWithStockSummary());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json();
    if (!body.code?.trim()) {
      return NextResponse.json({ error: "Code required" }, { status: 400 });
    }
    const loc = await createWarehouseLocation({
      code: body.code,
      zone: body.zone,
      label: body.label,
      notes: body.notes,
    });
    return NextResponse.json(loc);
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
