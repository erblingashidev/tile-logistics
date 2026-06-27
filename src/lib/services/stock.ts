import { eq, and, desc } from "drizzle-orm";
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
import { getProduct, upsertProduct } from "@/lib/services/products";

export interface ReceiveStockInput {
  ean: string;
  quantityM2: number;
  locationId: number;
  employeeId?: number;
  productName?: string;
  tileWidthCm?: number;
  tileHeightCm?: number;
  tileThicknessCm?: number;
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
  const inserted = await dbOne(
    db
      .insert(warehouseLocations)
      .values({
        code: input.code.trim().toUpperCase(),
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

/** Inbound from truck unload — registers product if new. */
export async function receiveStock(input: ReceiveStockInput) {
  if (input.quantityM2 <= 0) {
    return { ok: false as const, error: "Sasia në m² duhet të jetë më e madhe se 0." };
  }

  const product = await upsertProduct({
    ean: input.ean,
    productName: input.productName,
    tileWidthCm: input.tileWidthCm,
    tileHeightCm: input.tileHeightCm,
    tileThicknessCm: input.tileThicknessCm,
    source: "receive",
  });

  if (!product) {
    return { ok: false as const, error: "Produkti nuk u regjistrua." };
  }

  const w = product.tileWidthCm ?? input.tileWidthCm ?? 60;
  const h = product.tileHeightCm ?? input.tileHeightCm ?? 60;
  const breakdown = computePickBreakdown(
    input.quantityM2,
    w,
    h,
    product.tileThicknessCm
  );

  const db = await getDb();
  const now = new Date().toISOString();
  const balance = await getOrCreateBalance(product.id, input.locationId);

  await db
    .update(stockBalances)
    .set({
      quantityM2: (balance!.quantityM2 ?? 0) + input.quantityM2,
      fullPallets: (balance!.fullPallets ?? 0) + breakdown.fullPallets,
      loosePieces: (balance!.loosePieces ?? 0) + breakdown.loosePieces,
      updatedAt: now,
    })
    .where(eq(stockBalances.id, balance!.id));

  await db.insert(stockMovements).values({
    productId: product.id,
    locationId: input.locationId,
    movementType: "receive",
    quantityM2: input.quantityM2,
    fullPallets: breakdown.fullPallets,
    loosePieces: breakdown.loosePieces,
    referenceType: "receive",
    referenceId: null,
    employeeId: input.employeeId ?? null,
    notes: input.notes?.trim() || null,
    createdAt: now,
  });

  await logActivity(
    "create",
    "stock",
    product.id,
    `Received ${formatM2(input.quantityM2)} m² · EAN ${input.ean}`,
    {
      category: "system",
      details: {
        ean: input.ean,
        quantityM2: input.quantityM2,
        locationId: input.locationId,
        employeeId: input.employeeId,
      },
    }
  );

  return {
    ok: true as const,
    product: await getProduct(product.id),
    breakdown,
  };
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
        status: products.status,
        locationId: warehouseLocations.id,
        locationCode: warehouseLocations.code,
        locationLabel: warehouseLocations.label,
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
