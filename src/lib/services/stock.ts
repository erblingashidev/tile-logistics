import { eq, and, desc, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll, dbOne } from "@/lib/db/query";
import {
  products,
  stockBalances,
  stockMovements,
  warehouseLocations,
} from "@/lib/db/schema";
import {
  calculateTileLine,
  calculateTilePieces,
  formatM2,
  tileSpecOptionsForItem,
} from "@/lib/calculations";
import { logActivity } from "@/lib/logger";
import { quantityM2FromPackCounts } from "@/lib/product-pallet-spec";
import { getProduct, getProductByEan, upsertProduct } from "@/lib/services/products";

/** System bin for truck unload before physical putaway. */
export const STAGING_LOCATION_CODE = "STAGING";

export interface ReceiveStockInput {
  ean: string;
  /**
   * Optional on truck unload — defaults to STAGING so goods can be received
   * without choosing a bin yet. Putaway later via moveStock.
   */
  locationId?: number | null;
  /** Direct m² — optional if pallets/packs/pieces provided. */
  quantityM2?: number;
  fullPallets?: number;
  packs?: number;
  loosePieces?: number;
  employeeId?: number;
  productName?: string;
  tileWidthCm?: number;
  tileHeightCm?: number;
  tileThicknessCm?: number;
  batchCode?: string;
  productionDate?: string;
  shipmentRef?: string;
  /** opening = first registration; receive = truck unload. */
  movementType?: "receive" | "opening";
  notes?: string;
}

export interface PickBreakdown {
  totalPieces: number;
  fullPallets: number;
  loosePieces: number;
  piecesPerPallet: number;
  labelSq: string;
}

export function computePickBreakdown(
  quantityM2: number,
  widthCm: number,
  heightCm: number,
  thicknessCm?: number | null
): PickBreakdown {
  const options = tileSpecOptionsForItem({
    tileWidthCm: widthCm,
    tileHeightCm: heightCm,
    tileThicknessCm: thicknessCm,
  });
  const line = calculateTileLine(widthCm, heightCm, quantityM2, options);
  const totalPieces = calculateTilePieces(quantityM2, widthCm, heightCm);
  const piecesPerPallet = line.piecesPerPallet || 1;
  const fullPallets = Math.floor(totalPieces / piecesPerPallet);
  const loosePieces = totalPieces % piecesPerPallet;

  const parts: string[] = [];
  if (fullPallets > 0) {
    parts.push(`${fullPallets} palet${fullPallets > 1 ? "a" : ""} të plota`);
  }
  if (loosePieces > 0) {
    parts.push(`${loosePieces} pllaka`);
  }
  if (parts.length === 0) parts.push("0 pllaka");

  return {
    totalPieces,
    fullPallets,
    loosePieces,
    piecesPerPallet,
    labelSq: parts.join(" + "),
  };
}

export async function listWarehouseLocations() {
  const db = await getDb();
  return dbAll(
    db.select().from(warehouseLocations).orderBy(warehouseLocations.code)
  );
}

export async function createWarehouseLocation(input: {
  code: string;
  zone?: string;
  label?: string;
  notes?: string;
}) {
  const db = await getDb();
  const now = new Date().toISOString();
  const code = input.code.trim().toUpperCase();
  if (!code) {
    throw new Error("Location code required");
  }
  const inserted = await dbOne(
    db
      .insert(warehouseLocations)
      .values({
        code,
        zone: input.zone?.trim() || null,
        label: input.label?.trim() || null,
        notes: input.notes?.trim() || null,
        createdAt: now,
      })
      .returning({ id: warehouseLocations.id })
  );
  return dbOne(
    db
      .select()
      .from(warehouseLocations)
      .where(eq(warehouseLocations.id, inserted!.id))
  );
}

/** Find by code or create — used for STAGING and Pro-Data warehouse areas. */
export async function getOrCreateWarehouseLocation(input: {
  code: string;
  zone?: string;
  label?: string;
  notes?: string;
}) {
  const code = input.code.trim().toUpperCase();
  const db = await getDb();
  const existing = await dbOne(
    db
      .select()
      .from(warehouseLocations)
      .where(eq(warehouseLocations.code, code))
  );
  if (existing) return existing;
  return createWarehouseLocation({
    code,
    zone: input.zone,
    label: input.label,
    notes: input.notes,
  });
}

/** Unloaded / not yet put away — always available for optional-location receive. */
export async function ensureStagingLocation() {
  return getOrCreateWarehouseLocation({
    code: STAGING_LOCATION_CODE,
    zone: "Staging",
    label: "Unloaded (not put away)",
    notes: "Truck unload before assigning a bin. Move stock from here to putaway.",
  });
}

export async function updateWarehouseLocation(
  id: number,
  input: {
    code?: string;
    zone?: string | null;
    label?: string | null;
    notes?: string | null;
  }
) {
  const existing = await getWarehouseLocation(id);
  if (!existing) {
    return { ok: false as const, error: "Location not found" };
  }

  const nextCode =
    input.code !== undefined ? input.code.trim().toUpperCase() : undefined;
  if (nextCode !== undefined && !nextCode) {
    return { ok: false as const, error: "Code required" };
  }

  if (nextCode && nextCode !== existing.code) {
    const db = await getDb();
    const duplicate = await dbOne(
      db
        .select({ id: warehouseLocations.id })
        .from(warehouseLocations)
        .where(
          and(eq(warehouseLocations.code, nextCode), ne(warehouseLocations.id, id))
        )
    );
    if (duplicate) {
      return {
        ok: false as const,
        error: "A location with this code already exists",
      };
    }
  }

  const db = await getDb();
  await db
    .update(warehouseLocations)
    .set({
      ...(nextCode !== undefined ? { code: nextCode } : {}),
      ...(input.zone !== undefined ? { zone: input.zone?.trim() || null } : {}),
      ...(input.label !== undefined ? { label: input.label?.trim() || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
    })
    .where(eq(warehouseLocations.id, id));

  const location = await getWarehouseLocation(id);
  await logActivity(
    "update",
    "warehouse_location",
    id,
    `Updated location: ${location!.code}`,
    {
      category: "system",
      details: {
        code: location!.code,
        zone: location!.zone,
        label: location!.label,
      },
    }
  );

  return { ok: true as const, location: location! };
}

export async function deleteWarehouseLocation(id: number) {
  const existing = await getWarehouseLocation(id);
  if (!existing) {
    return { ok: false as const, error: "Location not found" };
  }

  const stock = await listStockAtLocation(id);
  const db = await getDb();
  await db.delete(warehouseLocations).where(eq(warehouseLocations.id, id));

  await logActivity(
    "delete",
    "warehouse_location",
    id,
    `Deleted location: ${existing.code}`,
    {
      category: "system",
      details: {
        code: existing.code,
        stockLinesRemoved: stock.length,
      },
    }
  );

  return { ok: true as const, removedStockLines: stock.length };
}

async function getOrCreateBalance(productId: number, locationId: number) {
  const db = await getDb();
  const existing = await dbOne(
    db
      .select()
      .from(stockBalances)
      .where(
        and(
          eq(stockBalances.productId, productId),
          eq(stockBalances.locationId, locationId)
        )
      )
  );
  if (existing) return existing;

  const now = new Date().toISOString();
  const inserted = await dbOne(
    db
      .insert(stockBalances)
      .values({
        productId,
        locationId,
        quantityM2: 0,
        fullPallets: 0,
        loosePieces: 0,
        updatedAt: now,
      })
      .returning({ id: stockBalances.id })
  );
  return dbOne(
    db
      .select()
      .from(stockBalances)
      .where(eq(stockBalances.id, inserted!.id))
  );
}

/** Inbound from truck unload / opening balance — uses catalog pack math when possible. */
export async function receiveStock(input: ReceiveStockInput) {
  const ean = input.ean?.trim();
  if (!ean || ean.length < 4) {
    return {
      ok: false as const,
      error: "Barcode / lot code required (min 4 characters).",
    };
  }

  let locationId =
    input.locationId != null && Number.isFinite(Number(input.locationId))
      ? Number(input.locationId)
      : null;
  if (locationId != null && locationId <= 0) locationId = null;

  if (locationId == null) {
    const staging = await ensureStagingLocation();
    locationId = staging!.id;
  } else {
    const loc = await getWarehouseLocation(locationId);
    if (!loc) {
      return {
        ok: false as const,
        error: "Location not found. Choose a bin or leave empty for staging.",
      };
    }
  }

  let product = await getProductByEan(ean);
  if (!product) {
    product = await upsertProduct({
      ean,
      productName: input.productName,
      tileWidthCm: input.tileWidthCm,
      tileHeightCm: input.tileHeightCm,
      tileThicknessCm: input.tileThicknessCm,
      batchCode: input.batchCode,
      productionDate: input.productionDate,
      shipmentRef: input.shipmentRef,
      source: "receive",
      asNewLot: true,
    });
  } else if (
    input.batchCode ||
    input.productionDate ||
    input.shipmentRef ||
    input.productName
  ) {
    await upsertProduct({
      ean,
      productName: input.productName ?? product.productName,
      batchCode: input.batchCode,
      productionDate: input.productionDate,
      shipmentRef: input.shipmentRef,
      source: "receive",
    });
    product = (await getProduct(product.id)) ?? product;
  }

  if (!product) {
    return { ok: false as const, error: "Produkti nuk u regjistrua." };
  }

  const qty = quantityM2FromPackCounts(product, {
    quantityM2: input.quantityM2,
    fullPallets: input.fullPallets,
    packs: input.packs,
    loosePieces: input.loosePieces,
  });
  if (!qty.ok) {
    return { ok: false as const, error: qty.error };
  }
  if (qty.quantityM2 <= 0) {
    return {
      ok: false as const,
      error: "Sasia duhet të jetë më e madhe se 0.",
    };
  }

  const w = product.tileWidthCm ?? input.tileWidthCm ?? 60;
  const h = product.tileHeightCm ?? input.tileHeightCm ?? 60;
  const catalogBreakdown =
    product.piecesPerPallet && product.piecesPerPallet > 0
      ? null
      : computePickBreakdown(qty.quantityM2, w, h, product.tileThicknessCm);
  const fullPallets = qty.fullPallets || catalogBreakdown?.fullPallets || 0;
  const loosePieces = qty.loosePieces || catalogBreakdown?.loosePieces || 0;
  const breakdown: PickBreakdown = {
    totalPieces:
      (product.piecesPerPallet ?? 0) > 0
        ? fullPallets * (product.piecesPerPallet ?? 0) + loosePieces
        : catalogBreakdown?.totalPieces ?? 0,
    fullPallets,
    loosePieces,
    piecesPerPallet:
      product.piecesPerPallet ?? catalogBreakdown?.piecesPerPallet ?? 1,
    labelSq:
      catalogBreakdown?.labelSq ??
      ([
        fullPallets > 0 ? `${fullPallets} paleta` : null,
        loosePieces > 0 ? `${loosePieces} pllaka` : null,
      ]
        .filter(Boolean)
        .join(" + ") || "0"),
  };

  const movementType = input.movementType === "opening" ? "opening" : "receive";
  const db = await getDb();
  const now = new Date().toISOString();
  const balance = await getOrCreateBalance(product.id, locationId);

  await db
    .update(stockBalances)
    .set({
      quantityM2: (balance!.quantityM2 ?? 0) + qty.quantityM2,
      fullPallets: (balance!.fullPallets ?? 0) + fullPallets,
      loosePieces: (balance!.loosePieces ?? 0) + loosePieces,
      updatedAt: now,
    })
    .where(eq(stockBalances.id, balance!.id));

  await db.insert(stockMovements).values({
    productId: product.id,
    locationId,
    movementType,
    quantityM2: qty.quantityM2,
    fullPallets,
    loosePieces,
    referenceType: movementType,
    referenceId: null,
    employeeId: input.employeeId ?? null,
    notes: input.notes?.trim() || null,
    createdAt: now,
  });

  const location = await getWarehouseLocation(locationId);

  await logActivity(
    "create",
    "stock",
    product.id,
    `${movementType === "opening" ? "Opening" : "Received"} ${formatM2(qty.quantityM2)} m² · ${ean}`,
    {
      category: "system",
      details: {
        ean,
        quantityM2: qty.quantityM2,
        fullPallets,
        loosePieces,
        locationId,
        locationCode: location?.code,
        employeeId: input.employeeId,
        movementType,
      },
    }
  );

  return {
    ok: true as const,
    product: await getProduct(product.id),
    quantityM2: qty.quantityM2,
    locationId,
    locationCode: location?.code ?? STAGING_LOCATION_CODE,
    breakdown,
  };
}

/** Move stock from one bin to another (putaway / relocate). */
export async function moveStock(input: {
  productId: number;
  fromLocationId: number;
  toLocationId: number;
  quantityM2?: number;
  fullPallets?: number;
  loosePieces?: number;
  employeeId?: number;
  notes?: string;
}) {
  if (
    !Number.isFinite(input.fromLocationId) ||
    !Number.isFinite(input.toLocationId) ||
    input.fromLocationId <= 0 ||
    input.toLocationId <= 0
  ) {
    return { ok: false as const, error: "Choose source and destination bins." };
  }
  if (input.fromLocationId === input.toLocationId) {
    return { ok: false as const, error: "Choose a different destination bin." };
  }

  const [fromLoc, toLoc] = await Promise.all([
    getWarehouseLocation(input.fromLocationId),
    getWarehouseLocation(input.toLocationId),
  ]);
  if (!fromLoc || !toLoc) {
    return { ok: false as const, error: "Location not found." };
  }

  const product = await getProduct(input.productId);
  if (!product) {
    return { ok: false as const, error: "Product not found." };
  }

  const qty = quantityM2FromPackCounts(product, {
    quantityM2: input.quantityM2,
    fullPallets: input.fullPallets,
    loosePieces: input.loosePieces,
  });
  if (!qty.ok) {
    return { ok: false as const, error: qty.error };
  }

  const db = await getDb();
  const now = new Date().toISOString();
  const from = await getOrCreateBalance(input.productId, input.fromLocationId);
  if ((from!.quantityM2 ?? 0) + 0.0001 < qty.quantityM2) {
    return {
      ok: false as const,
      error: `Only ${formatM2(from!.quantityM2 ?? 0)} m² at source location.`,
    };
  }

  await db
    .update(stockBalances)
    .set({
      quantityM2: Math.max(0, (from!.quantityM2 ?? 0) - qty.quantityM2),
      fullPallets: Math.max(0, (from!.fullPallets ?? 0) - qty.fullPallets),
      loosePieces: Math.max(0, (from!.loosePieces ?? 0) - qty.loosePieces),
      updatedAt: now,
    })
    .where(eq(stockBalances.id, from!.id));

  const to = await getOrCreateBalance(input.productId, input.toLocationId);
  await db
    .update(stockBalances)
    .set({
      quantityM2: (to!.quantityM2 ?? 0) + qty.quantityM2,
      fullPallets: (to!.fullPallets ?? 0) + qty.fullPallets,
      loosePieces: (to!.loosePieces ?? 0) + qty.loosePieces,
      updatedAt: now,
    })
    .where(eq(stockBalances.id, to!.id));

  await db.insert(stockMovements).values({
    productId: input.productId,
    locationId: input.toLocationId,
    movementType: "transfer",
    quantityM2: qty.quantityM2,
    fullPallets: qty.fullPallets,
    loosePieces: qty.loosePieces,
    referenceType: "transfer",
    referenceId: input.fromLocationId,
    employeeId: input.employeeId ?? null,
    notes:
      input.notes?.trim() ||
      `Moved from ${fromLoc.code} → ${toLoc.code}`,
    createdAt: now,
  });

  return {
    ok: true as const,
    quantityM2: qty.quantityM2,
    product: await getProduct(input.productId),
  };
}

/** Set stock balance to inventory count (adjustment, not additive receive). */
export async function adjustStockToCount(input: {
  productId: number;
  locationId: number;
  targetQuantityM2: number;
  employeeId?: number;
  notes?: string;
  referenceType?: string;
  referenceId?: number;
}) {
  const product = await getProduct(input.productId);
  if (!product) {
    return { ok: false as const, error: "Produkti nuk u gjet." };
  }

  const db = await getDb();
  const now = new Date().toISOString();
  const balance = await getOrCreateBalance(input.productId, input.locationId);
  const currentM2 = balance!.quantityM2 ?? 0;
  const delta = input.targetQuantityM2 - currentM2;

  if (Math.abs(delta) < 0.0001) {
    return { ok: true as const, skipped: true as const, delta: 0 };
  }

  const w = product.tileWidthCm ?? 60;
  const h = product.tileHeightCm ?? 60;
  const breakdown = computePickBreakdown(
    Math.max(0, input.targetQuantityM2),
    w,
    h,
    product.tileThicknessCm
  );

  await db
    .update(stockBalances)
    .set({
      quantityM2: Math.max(0, input.targetQuantityM2),
      fullPallets: breakdown.fullPallets,
      loosePieces: breakdown.loosePieces,
      updatedAt: now,
    })
    .where(eq(stockBalances.id, balance!.id));

  await db.insert(stockMovements).values({
    productId: input.productId,
    locationId: input.locationId,
    movementType: "inventory_adjust",
    quantityM2: delta,
    fullPallets: 0,
    loosePieces: 0,
    referenceType: input.referenceType ?? "inventory",
    referenceId: input.referenceId ?? null,
    employeeId: input.employeeId ?? null,
    notes: input.notes?.trim() || null,
    createdAt: now,
  });

  return { ok: true as const, skipped: false as const, delta };
}

export async function listStockSummary() {
  const db = await getDb();
  const rows = await dbAll(
    db
      .select({
        balanceId: stockBalances.id,
        productId: products.id,
        ean: products.ean,
        productName: products.productName,
        tileWidthCm: products.tileWidthCm,
        tileHeightCm: products.tileHeightCm,
        batchCode: products.batchCode,
        shipmentRef: products.shipmentRef,
        m2PerPallet: products.m2PerPallet,
        piecesPerPallet: products.piecesPerPallet,
        packsPerPallet: products.packsPerPallet,
        status: products.status,
        locationId: warehouseLocations.id,
        locationCode: warehouseLocations.code,
        locationLabel: warehouseLocations.label,
        locationZone: warehouseLocations.zone,
        quantityM2: stockBalances.quantityM2,
        fullPallets: stockBalances.fullPallets,
        loosePieces: stockBalances.loosePieces,
        updatedAt: stockBalances.updatedAt,
      })
      .from(stockBalances)
      .innerJoin(products, eq(stockBalances.productId, products.id))
      .innerJoin(
        warehouseLocations,
        eq(stockBalances.locationId, warehouseLocations.id)
      )
      .orderBy(desc(stockBalances.updatedAt))
  );
  return rows;
}

export async function listStockAtLocation(locationId: number) {
  const rows = await listStockSummary();
  return rows.filter((row) => row.locationId === locationId);
}

export async function getWarehouseLocation(locationId: number) {
  const db = await getDb();
  return dbOne(
    db
      .select()
      .from(warehouseLocations)
      .where(eq(warehouseLocations.id, locationId))
  );
}

export async function listLocationsWithStockSummary() {
  const locations = await listWarehouseLocations();
  const balances = await listStockSummary();

  return locations.map((loc) => {
    const atLoc = balances.filter((b) => b.locationId === loc.id);
    return {
      ...loc,
      productCount: atLoc.length,
      totalM2: atLoc.reduce((sum, row) => sum + row.quantityM2, 0),
      totalPallets: atLoc.reduce((sum, row) => sum + row.fullPallets, 0),
      totalLoosePieces: atLoc.reduce((sum, row) => sum + row.loosePieces, 0),
    };
  });
}

export async function listStockMovements(limit = 100) {
  const db = await getDb();
  return dbAll(
    db
      .select({
        id: stockMovements.id,
        movementType: stockMovements.movementType,
        quantityM2: stockMovements.quantityM2,
        fullPallets: stockMovements.fullPallets,
        loosePieces: stockMovements.loosePieces,
        notes: stockMovements.notes,
        createdAt: stockMovements.createdAt,
        ean: products.ean,
        productName: products.productName,
        locationCode: warehouseLocations.code,
      })
      .from(stockMovements)
      .innerJoin(products, eq(stockMovements.productId, products.id))
      .leftJoin(
        warehouseLocations,
        eq(stockMovements.locationId, warehouseLocations.id)
      )
      .orderBy(desc(stockMovements.createdAt))
      .limit(limit)
  );
}

/**
 * Set absolute quantity at a product × location (Pro-Data snapshot sync).
 * Same product can have different m² in different locations.
 */
export async function setStockBalanceAbsolute(input: {
  productId: number;
  locationId: number;
  quantityM2: number;
  employeeId?: number;
  notes?: string;
  referenceType?: string;
}) {
  return adjustStockToCount({
    productId: input.productId,
    locationId: input.locationId,
    targetQuantityM2: Math.max(0, input.quantityM2),
    employeeId: input.employeeId,
    notes: input.notes,
    referenceType: input.referenceType ?? "prodata_sync",
  });
}

/** Totals per product across all locations (for UI: 51 + 39 = 90). */
export function groupStockByProduct(
  rows: Awaited<ReturnType<typeof listStockSummary>>
) {
  const map = new Map<
    number,
    {
      productId: number;
      ean: string | null;
      productName: string | null;
      totalM2: number;
      locations: typeof rows;
    }
  >();
  for (const row of rows) {
    const existing = map.get(row.productId);
    if (!existing) {
      map.set(row.productId, {
        productId: row.productId,
        ean: row.ean,
        productName: row.productName,
        totalM2: row.quantityM2,
        locations: [row],
      });
    } else {
      existing.totalM2 += row.quantityM2;
      existing.locations.push(row);
    }
  }
  return [...map.values()].sort((a, b) => b.totalM2 - a.totalM2);
}
