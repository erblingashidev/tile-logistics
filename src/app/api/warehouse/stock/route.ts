import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  createWarehouseLocation,
  listStockMovements,
  listStockSummary,
  listWarehouseLocations,
  receiveStock,
} from "@/lib/services/stock";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const view = url.searchParams.get("view");
    if (view === "movements") {
      return NextResponse.json(await listStockMovements());
    }
    if (view === "locations") {
      return NextResponse.json(await listWarehouseLocations());
    }
    return NextResponse.json(await listStockSummary());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json();

    if (body.action === "location") {
      const loc = await createWarehouseLocation({
        code: body.code,
        zone: body.zone,
        label: body.label,
        notes: body.notes,
      });
      return NextResponse.json(loc);
    }

    const result = await receiveStock({
      ean: String(body.ean ?? ""),
      quantityM2: Number(body.quantityM2),
      locationId: Number(body.locationId),
      productName: body.productName,
      tileWidthCm: body.tileWidthCm,
      tileHeightCm: body.tileHeightCm,
      tileThicknessCm: body.tileThicknessCm,
      notes: body.notes,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
