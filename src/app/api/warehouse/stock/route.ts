import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  createWarehouseLocation,
  listStockMovements,
  listStockSummary,
  listWarehouseLocations,
  moveStock,
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

    if (body.action === "move") {
      const result = await moveStock({
        productId: Number(body.productId),
        fromLocationId: Number(body.fromLocationId),
        toLocationId: Number(body.toLocationId),
        quantityM2:
          body.quantityM2 != null ? Number(body.quantityM2) : undefined,
        fullPallets:
          body.fullPallets != null ? Number(body.fullPallets) : undefined,
        loosePieces:
          body.loosePieces != null ? Number(body.loosePieces) : undefined,
        notes: body.notes,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    const result = await receiveStock({
      ean: String(body.ean ?? ""),
      quantityM2:
        body.quantityM2 != null && body.quantityM2 !== ""
          ? Number(body.quantityM2)
          : undefined,
      fullPallets:
        body.fullPallets != null && body.fullPallets !== ""
          ? Number(body.fullPallets)
          : undefined,
      packs:
        body.packs != null && body.packs !== ""
          ? Number(body.packs)
          : undefined,
      loosePieces:
        body.loosePieces != null && body.loosePieces !== ""
          ? Number(body.loosePieces)
          : undefined,
      locationId: Number(body.locationId),
      productName: body.productName,
      tileWidthCm: body.tileWidthCm,
      tileHeightCm: body.tileHeightCm,
      tileThicknessCm: body.tileThicknessCm,
      batchCode: body.batchCode,
      productionDate: body.productionDate,
      shipmentRef: body.shipmentRef,
      movementType: body.movementType === "opening" ? "opening" : "receive",
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
