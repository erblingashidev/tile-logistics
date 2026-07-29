import { NextResponse } from "next/server";
import {
  employeeCanUseWms,
  requireEmployee,
} from "@/lib/auth";
import {
  addInventoryLine,
  closeSectorCount,
  getOpenInventorySession,
  listInventoryZonesWithStatus,
  startSectorCount,
} from "@/lib/services/inventory";
import {
  ensureStagingLocation,
  listStockLocationsForProduct,
  listWarehouseLocations,
  receiveStock,
  moveStock,
} from "@/lib/services/stock";
import { getProduct, searchProducts } from "@/lib/services/products";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll } from "@/lib/db/query";
import { warehouseLocations } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const session = await requireEmployee();
    if (!employeeCanUseWms(session)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const zone = url.searchParams.get("zone")?.trim();
    const productIdRaw = url.searchParams.get("productId");
    const productSearch = url.searchParams.get("productSearch")?.trim();

    await ensureStagingLocation();

    if (productSearch) {
      const products = await searchProducts(productSearch, 12);
      return NextResponse.json(
        products.map((p) => ({
          id: p.id,
          ean: p.ean,
          productName: p.productName,
        }))
      );
    }

    const productId = productIdRaw ? Number(productIdRaw) : NaN;
    if (Number.isFinite(productId) && productId > 0) {
      return NextResponse.json(await listStockLocationsForProduct(productId));
    }

    const [locations, openSession] = await Promise.all([
      zone
        ? (async () => {
            const db = await getDb();
            return dbAll(
              db
                .select()
                .from(warehouseLocations)
                .where(eq(warehouseLocations.zone, zone))
                .orderBy(warehouseLocations.code)
            );
          })()
        : listWarehouseLocations(),
      getOpenInventorySession(),
    ]);

    const zones = openSession
      ? await listInventoryZonesWithStatus(openSession.id)
      : [];

    return NextResponse.json({ locations, openSession, zones });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireEmployee();
    if (!employeeCanUseWms(session)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await request.json();

    if (body.action === "receive") {
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
        employeeId: session.employeeId,
        productName: body.productName,
        batchCode: body.batchCode,
        shipmentRef: body.shipmentRef,
        notes: body.notes,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    if (body.action === "putaway") {
      const productId = Number(body.productId);
      const locationId = Number(body.locationId);
      const quantityM2 = Number(body.quantityM2);
      if (!Number.isFinite(productId) || productId <= 0) {
        return NextResponse.json({ error: "Zgjidhni produktin." }, { status: 400 });
      }
      const product = await getProduct(productId);
      if (!product?.ean) {
        return NextResponse.json({ error: "Produkti nuk ka barkod." }, { status: 400 });
      }
      const result = await receiveStock({
        ean: product.ean,
        productName: product.productName ?? undefined,
        locationId,
        quantityM2,
        employeeId: session.employeeId,
        movementType: "receive",
        notes: `Putaway at outdoor row`,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    if (body.action === "move_from_staging") {
      const productId = Number(body.productId);
      const toLocationId = Number(body.toLocationId);
      const quantityM2 = Number(body.quantityM2);
      const staging = await ensureStagingLocation();
      const result = await moveStock({
        productId,
        fromLocationId: staging!.id,
        toLocationId,
        quantityM2,
        employeeId: session.employeeId,
        notes: "Putaway from staging",
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    if (body.action === "start_sector") {
      const open = await getOpenInventorySession();
      if (!open) {
        return NextResponse.json(
          { error: "Nuk ka inventar të hapur. Kontaktoni adminin." },
          { status: 400 }
        );
      }
      const result = await startSectorCount({
        sessionId: open.id,
        zone: String(body.zone ?? ""),
        employeeId: session.employeeId,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    if (body.action === "close_sector") {
      const result = await closeSectorCount({
        sectorCountId: Number(body.sectorCountId),
        employeeId: session.employeeId,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    if (body.action === "inventory") {
      const open = await getOpenInventorySession();
      if (!open) {
        return NextResponse.json(
          { error: "Nuk ka inventar të hapur. Kontaktoni adminin." },
          { status: 400 }
        );
      }
      const result = await addInventoryLine({
        sessionId: open.id,
        ean: String(body.ean ?? ""),
        quantityM2: Number(body.quantityM2),
        locationId: Number(body.locationId),
        zone: String(body.zone ?? ""),
        sectorCountId: Number(body.sectorCountId),
        employeeId: session.employeeId,
        notes: body.notes,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
