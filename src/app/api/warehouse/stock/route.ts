import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { importProDataStockExcel } from "@/lib/integrations/prodata-stock";
import {
  createWarehouseLocation,
  ensureStagingLocation,
  listStockMovements,
  listStockSummary,
  listWarehouseLocations,
  moveStock,
  receiveStock,
} from "@/lib/services/stock";

export const runtime = "nodejs";

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    await ensureStagingLocation();
    const url = new URL(request.url);
    const view = url.searchParams.get("view");
    if (view === "movements") {
      return NextResponse.json(await listStockMovements());
    }
    if (view === "locations") {
      return NextResponse.json(await listWarehouseLocations());
    }
    return NextResponse.json(await listStockSummary());
  } catch (err) {
    const msg = errorMessage(err, "Unauthorized");
    const status = /unauthorized|forbidden|session/i.test(msg) ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "Upload a Pro-Data Excel (.xlsx) file." },
          { status: 400 }
        );
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await importProDataStockExcel(buffer);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    const body = await request.json();

    if (body.action === "location") {
      try {
        const loc = await createWarehouseLocation({
          code: body.code,
          zone: body.zone,
          label: body.label,
          notes: body.notes,
        });
        return NextResponse.json(loc);
      } catch (err) {
        return NextResponse.json(
          { error: errorMessage(err, "Could not create location") },
          { status: 400 }
        );
      }
    }

    if (body.action === "move") {
      const result = await moveStock({
        productId: Number(body.productId),
        fromLocationId: Number(body.fromLocationId),
        toLocationId: Number(body.toLocationId),
        quantityM2:
          body.quantityM2 != null && body.quantityM2 !== ""
            ? Number(body.quantityM2)
            : undefined,
        fullPallets:
          body.fullPallets != null && body.fullPallets !== ""
            ? Number(body.fullPallets)
            : undefined,
        loosePieces:
          body.loosePieces != null && body.loosePieces !== ""
            ? Number(body.loosePieces)
            : undefined,
        notes: body.notes,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    const locationRaw = body.locationId;
    const locationId =
      locationRaw === "" || locationRaw == null
        ? null
        : Number(locationRaw);

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
      locationId:
        locationId != null && Number.isFinite(locationId) ? locationId : null,
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
  } catch (err) {
    console.error("[warehouse/stock]", err);
    return NextResponse.json(
      { error: errorMessage(err, "Bad request") },
      { status: 400 }
    );
  }
}
