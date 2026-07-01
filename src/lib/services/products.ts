import { eq, desc, or, like, sql, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll, dbOne } from "@/lib/db/query";
import { orderItems, products } from "@/lib/db/schema";
import {
  calculateTileLine,
  parseUnitWeightKgFromName,
  tileSpecOptionsForItem,
  type OrderItemInput,
} from "@/lib/calculations";
import { normalizeOrderUnit, inferOrderUnitFromProductName, type OrderUnit } from "@/lib/constants";
import { logActivity } from "@/lib/logger";
import {
  derivePalletFields,
  palletSpecFromProduct,
  type ProductPalletSpec,
} from "@/lib/product-pallet-spec";

export type ProductSource = "order" | "receive" | "inventory" | "manual";

export type ProductRecord = typeof products.$inferSelect;

export interface ProductUpsertInput {
  ean?: string | null;
  productName?: string | null;
  unit?: OrderUnit | string | null;
  tileWidthCm?: number | null;
  tileHeightCm?: number | null;
  tileThicknessCm?: number | null;
  piecesPerPallet?: number | null;
  m2PerPallet?: number | null;
  kgPerPallet?: number | null;
  piecesPerPack?: number | null;
  m2PerPack?: number | null;
  kgPerPack?: number | null;
  unitWeightKg?: number | null;
  palletFootprintLengthCm?: number | null;
  palletFootprintWidthCm?: number | null;
  replacesStandardPallets?: number | null;
  source: ProductSource;
  status?: "draft" | "confirmed";
  notes?: string | null;
}

function normalizeEan(ean?: string | null): string | null {
  const v = ean?.trim().replace(/\s/g, "");
  return v && v.length >= 4 ? v : null;
}

function inferDimensionsFromName(name: string): {
  width?: number;
  height?: number;
} {
  const match = name.match(/(\d{2,3})\s*[x×X*]\s*(\d{2,3})/);
  if (!match) return {};
  return { width: Number(match[1]), height: Number(match[2]) };
}

function inferUnitFromName(name: string): OrderUnit {
  return inferOrderUnitFromProductName(name) ?? "piece";
}

function tileLineDefaults(
  width?: number | null,
  height?: number | null,
  thicknessCm?: number | null
) {
  if (!width || !height) return null;
  const specItem: OrderItemInput = {
    unit: "m2",
    tileWidthCm: width,
    tileHeightCm: height,
    tileThicknessCm: thicknessCm ?? undefined,
    quantityM2: 1,
  };
  return calculateTileLine(width, height, 1, tileSpecOptionsForItem(specItem));
}

function mergeNumber(
  existing: number | null | undefined,
  incoming: number | null | undefined
): number | null | undefined {
  if (incoming == null || !Number.isFinite(incoming) || incoming <= 0) {
    return existing;
  }
  return existing ?? incoming;
}

function mergeText(
  existing: string | null | undefined,
  incoming: string | null | undefined
): string | null | undefined {
  const next = incoming?.trim();
  if (!next) return existing;
  return existing?.trim() ? existing : next;
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

/** Search catalog by barcode (exact) or partial name / EAN. */
export async function searchProducts(query: string, limit = 12): Promise<ProductRecord[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const eanKey = normalizeEan(trimmed);
  if (eanKey) {
    const exact = await getProductByEan(eanKey);
    if (exact) return [exact];
  }

  const db = await getDb();
  const pattern = `%${trimmed.replace(/[%_]/g, "")}%`;
  return dbAll(
    db
      .select()
      .from(products)
      .where(
        or(
          like(products.productName, pattern),
          like(products.ean, pattern),
          sql`lower(${products.productName}) LIKE lower(${pattern})`
        )
      )
      .orderBy(desc(products.updatedAt))
      .limit(limit)
  );
}

/** Create or update catalog entry — EAN match first, else enrich existing draft by name. */
export async function upsertProduct(input: ProductUpsertInput) {
  const db = await getDb();
  const now = new Date().toISOString();
  const ean = normalizeEan(input.ean);
  const unit = normalizeOrderUnit(input.unit ?? inferUnitFromName(input.productName ?? ""));
  let width = input.tileWidthCm ?? undefined;
  let height = input.tileHeightCm ?? undefined;

  if ((!width || !height) && input.productName) {
    const inferred = inferDimensionsFromName(input.productName);
    width = width ?? inferred.width;
    height = height ?? inferred.height;
  }

  const line =
    unit === "m2" ? tileLineDefaults(width, height, input.tileThicknessCm) : null;
  const unitWeightKg =
    input.unitWeightKg ??
    (unit === "kg" && input.productName
      ? parseUnitWeightKgFromName(input.productName)
      : null);

  let existing = ean ? await getProductByEan(ean) : null;
  if (!existing && input.productName?.trim()) {
    const nameMatches = await searchProducts(input.productName.trim(), 3);
    existing =
      nameMatches.find(
        (p) =>
          p.productName?.trim().toLowerCase() ===
          input.productName!.trim().toLowerCase()
      ) ?? null;
  }

  const payload = {
    productName: input.productName?.trim() || null,
    unit,
    tileWidthCm: width ?? null,
    tileHeightCm: height ?? null,
    tileThicknessCm: input.tileThicknessCm ?? null,
    piecesPerPallet:
      input.piecesPerPallet ?? line?.piecesPerPallet ?? null,
    m2PerPallet: input.m2PerPallet ?? line?.m2PerPallet ?? null,
    kgPerPallet: input.kgPerPallet ?? line?.kgPerPallet ?? null,
    piecesPerPack: input.piecesPerPack ?? null,
    m2PerPack: input.m2PerPack ?? null,
    kgPerPack: input.kgPerPack ?? null,
    unitWeightKg: unitWeightKg ?? null,
    palletFootprintLengthCm: input.palletFootprintLengthCm ?? null,
    palletFootprintWidthCm: input.palletFootprintWidthCm ?? null,
    replacesStandardPallets: input.replacesStandardPallets ?? 1,
    status: input.status ?? "draft",
    notes: input.notes ?? null,
    updatedAt: now,
  };

  if (existing) {
    const updates: Record<string, unknown> = { updatedAt: now };
    updates.productName = mergeText(existing.productName, payload.productName);
    if (!existing.unit || existing.unit === "m2") updates.unit = unit;
    updates.tileWidthCm = mergeNumber(existing.tileWidthCm, payload.tileWidthCm);
    updates.tileHeightCm = mergeNumber(existing.tileHeightCm, payload.tileHeightCm);
    updates.tileThicknessCm = mergeNumber(
      existing.tileThicknessCm,
      payload.tileThicknessCm
    );
    updates.piecesPerPallet = mergeNumber(
      existing.piecesPerPallet,
      payload.piecesPerPallet
    );
    updates.m2PerPallet = mergeNumber(existing.m2PerPallet, payload.m2PerPallet);
    updates.kgPerPallet = mergeNumber(existing.kgPerPallet, payload.kgPerPallet);
    updates.piecesPerPack = mergeNumber(
      existing.piecesPerPack,
      payload.piecesPerPack
    );
    updates.m2PerPack = mergeNumber(existing.m2PerPack, payload.m2PerPack);
    updates.kgPerPack = mergeNumber(existing.kgPerPack, payload.kgPerPack);
    updates.unitWeightKg = mergeNumber(existing.unitWeightKg, payload.unitWeightKg);
    updates.palletFootprintLengthCm = mergeNumber(
      existing.palletFootprintLengthCm,
      payload.palletFootprintLengthCm
    );
    updates.palletFootprintWidthCm = mergeNumber(
      existing.palletFootprintWidthCm,
      payload.palletFootprintWidthCm
    );
    updates.replacesStandardPallets = mergeNumber(
      existing.replacesStandardPallets,
      payload.replacesStandardPallets
    );
    if (existing.status === "draft" && input.status === "confirmed") {
      updates.status = "confirmed";
    }

    await db.update(products).set(updates).where(eq(products.id, existing.id));
    return getProduct(existing.id);
  }

  const inserted = await dbOne(
    db
      .insert(products)
      .values({
        ean,
        ...payload,
        source: input.source,
        createdAt: now,
      })
      .returning({ id: products.id })
  );

  const id = inserted!.id;
  await logActivity(
    "create",
    "product",
    id,
    `Product catalog: ${ean ?? input.productName ?? id}`,
    {
      category: "system",
      details: { ean, source: input.source, unit },
    }
  );

  return getProduct(id);
}

function observedPalletStats(item: typeof orderItems.$inferSelect) {
  const palletCount = item.palletCount ?? item.calculatedPallets;
  const pieces = item.pieceCount ?? item.calculatedPieces;
  const m2 = item.quantityM2;

  return {
    piecesPerPallet:
      palletCount && pieces && palletCount > 0
        ? Math.round(pieces / palletCount)
        : null,
    m2PerPallet:
      palletCount && m2 && palletCount > 0
        ? Math.round((m2 / palletCount) * 100) / 100
        : null,
  };
}

export async function registerProductsFromOrder(orderId: number) {
  const db = await getDb();
  const items = await dbAll(
    db.select().from(orderItems).where(eq(orderItems.orderId, orderId))
  );

  const registered: ProductRecord[] = [];
  for (const item of items) {
    const unit = normalizeOrderUnit(item.unit);
    const observed = observedPalletStats(item);
    const unitWeightKg =
      unit === "kg" && item.productName
        ? parseUnitWeightKgFromName(item.productName)
        : null;

    const product = await upsertProduct({
      ean: item.productEan,
      productName: item.productName,
      unit,
      tileWidthCm: item.tileWidthCm,
      tileHeightCm: item.tileHeightCm,
      tileThicknessCm: item.tileThicknessCm,
      piecesPerPallet: observed.piecesPerPallet,
      m2PerPallet: observed.m2PerPallet,
      unitWeightKg,
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

export async function updateProduct(
  id: number,
  input: ProductUpsertInput
): Promise<{ ok: true; product: ProductRecord } | { ok: false; error: string }> {
  const existing = await getProduct(id);
  if (!existing) {
    return { ok: false as const, error: "Product not found" };
  }

  const db = await getDb();
  const now = new Date().toISOString();
  const unit = normalizeOrderUnit(
    input.unit ?? existing.unit ?? inferUnitFromName(input.productName ?? existing.productName ?? "")
  );
  let width = input.tileWidthCm ?? existing.tileWidthCm ?? undefined;
  let height = input.tileHeightCm ?? existing.tileHeightCm ?? undefined;
  const name = input.productName?.trim() || existing.productName;

  if ((!width || !height) && name) {
    const inferred = inferDimensionsFromName(name);
    width = width ?? inferred.width;
    height = height ?? inferred.height;
  }

  const derived = derivePalletFields({
    tileWidthCm: width,
    tileHeightCm: height,
    piecesPerPallet: input.piecesPerPallet ?? existing.piecesPerPallet,
    m2PerPallet: input.m2PerPallet ?? existing.m2PerPallet,
    kgPerPallet: input.kgPerPallet ?? existing.kgPerPallet,
  });

  const ean =
    input.ean !== undefined ? normalizeEan(input.ean) : existing.ean;

  await db
    .update(products)
    .set({
      ean,
      productName: name,
      unit,
      tileWidthCm: width ?? null,
      tileHeightCm: height ?? null,
      tileThicknessCm:
        input.tileThicknessCm !== undefined
          ? input.tileThicknessCm
          : existing.tileThicknessCm,
      piecesPerPallet:
        input.piecesPerPallet !== undefined
          ? input.piecesPerPallet
          : existing.piecesPerPallet,
      m2PerPallet: derived.m2PerPallet ?? existing.m2PerPallet,
      kgPerPallet:
        input.kgPerPallet !== undefined ? input.kgPerPallet : existing.kgPerPallet,
      piecesPerPack:
        input.piecesPerPack !== undefined
          ? input.piecesPerPack
          : existing.piecesPerPack,
      m2PerPack:
        input.m2PerPack !== undefined ? input.m2PerPack : existing.m2PerPack,
      kgPerPack:
        input.kgPerPack !== undefined ? input.kgPerPack : existing.kgPerPack,
      unitWeightKg:
        input.unitWeightKg !== undefined
          ? input.unitWeightKg
          : existing.unitWeightKg,
      palletFootprintLengthCm:
        input.palletFootprintLengthCm !== undefined
          ? input.palletFootprintLengthCm
          : existing.palletFootprintLengthCm,
      palletFootprintWidthCm:
        input.palletFootprintWidthCm !== undefined
          ? input.palletFootprintWidthCm
          : existing.palletFootprintWidthCm,
      replacesStandardPallets:
        input.replacesStandardPallets !== undefined
          ? input.replacesStandardPallets
          : existing.replacesStandardPallets,
      status: input.status ?? existing.status,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      updatedAt: now,
    })
    .where(eq(products.id, id));

  const product = await getProduct(id);
  return { ok: true as const, product: product! };
}

export async function resolveOrderItemCatalog(item: {
  productId?: number;
  productEan?: string;
  productName?: string;
}): Promise<ProductPalletSpec | null> {
  if (item.productId) {
    return palletSpecFromProduct(await getProduct(item.productId));
  }
  if (item.productEan?.trim()) {
    return palletSpecFromProduct(await getProductByEan(item.productEan));
  }
  const name = item.productName?.trim();
  if (!name) return null;
  const matches = await searchProducts(name, 8);
  const exact = matches.find(
    (p) => p.productName?.trim().toLowerCase() === name.toLowerCase()
  );
  return palletSpecFromProduct(exact ?? matches[0] ?? null);
}

export async function deleteProduct(id: number) {
  const db = await getDb();
  const existing = await getProduct(id);
  if (!existing) return { ok: false as const, error: "Product not found" };

  await db.delete(products).where(eq(products.id, id));
  await logActivity(
    "delete",
    "product",
    id,
    `Deleted product: ${existing.ean ?? existing.productName ?? id}`,
    {
      category: "system",
      details: { ean: existing.ean, productName: existing.productName },
    }
  );
  return { ok: true as const, id };
}

export async function deleteProducts(ids: number[]) {
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
  if (unique.length === 0) {
    return { ok: false as const, error: "No products selected", deleted: 0 };
  }

  const db = await getDb();
  const existing = await dbAll(
    db.select().from(products).where(inArray(products.id, unique))
  );
  if (existing.length === 0) {
    return { ok: false as const, error: "Products not found", deleted: 0 };
  }

  await db.delete(products).where(inArray(products.id, unique));

  for (const product of existing) {
    await logActivity(
      "delete",
      "product",
      product.id,
      `Deleted product: ${product.ean ?? product.productName ?? product.id}`,
      {
        category: "system",
        details: { ean: product.ean, productName: product.productName },
      }
    );
  }

  return { ok: true as const, deleted: existing.length };
}

export { productToOrderItemDefaults } from "@/lib/product-pallet-spec";
