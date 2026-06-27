import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll, dbOne } from "@/lib/db/query";
import { orderItems, products } from "@/lib/db/schema";
import {
  calculateTileLine,
  tileSpecOptionsForItem,
  type OrderItemInput,
} from "@/lib/calculations";
import { logActivity } from "@/lib/logger";

export type ProductSource = "order" | "receive" | "inventory" | "manual";

export interface ProductUpsertInput {
  ean?: string | null;
  productName?: string | null;
  tileWidthCm?: number | null;
  tileHeightCm?: number | null;
  tileThicknessCm?: number | null;
  source: ProductSource;
  status?: "draft" | "confirmed";
}

function normalizeEan(ean?: string | null): string | null {
  const v = ean?.trim().replace(/\s/g, "");
  return v && v.length >= 4 ? v : null;
}

function inferDimensionsFromName(name: string): {
  width?: number;
  height?: number;
} {
  const match = name.match(/(\d{2,3})\s*[x×X]\s*(\d{2,3})/);
  if (!match) return {};
  return { width: Number(match[1]), height: Number(match[2]) };
}

export async function getProduct(id: number) {
  const db = await getDb();
  return dbOne(db.select().from(products).where(eq(products.id, id)));
}

export async function getProductByEan(ean: string) {
  const db = await getDb();
  const key = normalizeEan(ean);
  if (!key) return null;
  return dbOne(db.select().from(products).where(eq(products.ean, key)));
}

export async function listProducts(limit = 200) {
  const db = await getDb();
  return dbAll(
    db.select().from(products).orderBy(desc(products.updatedAt)).limit(limit)
  );
}

/** Create or update catalog entry — EAN is the primary key when present. */
export async function upsertProduct(input: ProductUpsertInput) {
  const db = await getDb();
  const now = new Date().toISOString();
  const ean = normalizeEan(input.ean);
  let width = input.tileWidthCm ?? undefined;
  let height = input.tileHeightCm ?? undefined;

  if ((!width || !height) && input.productName) {
    const inferred = inferDimensionsFromName(input.productName);
    width = width ?? inferred.width;
    height = height ?? inferred.height;
  }

  const specItem: OrderItemInput = {
    productType: "tile",
    tileWidthCm: width,
    tileHeightCm: height,
    tileThicknessCm: input.tileThicknessCm ?? undefined,
    quantityM2: 1,
  };
  const line =
    width && height
      ? calculateTileLine(width, height, 1, tileSpecOptionsForItem(specItem))
      : null;

  const existing = ean
    ? await getProductByEan(ean)
    : null;

  if (existing) {
    const updates: Record<string, unknown> = { updatedAt: now };
    if (!existing.productName && input.productName) {
      updates.productName = input.productName.trim();
    }
    if (!existing.tileWidthCm && width) updates.tileWidthCm = width;
    if (!existing.tileHeightCm && height) updates.tileHeightCm = height;
    if (!existing.tileThicknessCm && input.tileThicknessCm) {
      updates.tileThicknessCm = input.tileThicknessCm;
    }
    if (!existing.piecesPerPallet && line) {
      updates.piecesPerPallet = line.piecesPerPallet;
      updates.m2PerPallet = line.m2PerPallet;
    }
    if (existing.status === "draft" && input.status === "confirmed") {
      updates.status = "confirmed";
    }

    if (Object.keys(updates).length > 1) {
      await db
        .update(products)
        .set(updates)
        .where(eq(products.id, existing.id));
    }
    return getProduct(existing.id);
  }

  const inserted = await dbOne(
    db
      .insert(products)
      .values({
        ean,
        productName: input.productName?.trim() || null,
        tileWidthCm: width ?? null,
        tileHeightCm: height ?? null,
        tileThicknessCm: input.tileThicknessCm ?? null,
        piecesPerPallet: line?.piecesPerPallet ?? null,
        m2PerPallet: line?.m2PerPallet ?? null,
        status: input.status ?? "draft",
        source: input.source,
        notes: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: products.id })
  );

  const id = inserted!.id;
  await logActivity("create", "product", id, `Product catalog: ${ean ?? input.productName ?? id}`, {
    category: "system",
    details: { ean, source: input.source },
  });

  return getProduct(id);
}

export async function registerProductsFromOrder(orderId: number) {
  const db = await getDb();
  const items = await dbAll(
    db.select().from(orderItems).where(eq(orderItems.orderId, orderId))
  );

  const registered = [];
  for (const item of items) {
    const ean = normalizeEan(item.productEan);
    const product = await upsertProduct({
      ean,
      productName: item.productName,
      tileWidthCm: item.tileWidthCm,
      tileHeightCm: item.tileHeightCm,
      tileThicknessCm: item.tileThicknessCm,
      source: "order",
    });
    if (product) registered.push(product);
  }
  return registered;
}

export async function confirmProduct(id: number) {
  const db = await getDb();
  const now = new Date().toISOString();
  await db
    .update(products)
    .set({ status: "confirmed", updatedAt: now })
    .where(eq(products.id, id));
  return getProduct(id);
}
