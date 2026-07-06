import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbOne } from "@/lib/db/query";
import { productAliases, products } from "@/lib/db/schema";
import { normalizeOrderUnit, type OrderUnit } from "@/lib/constants";

export type ProductLearnSource = "order" | "import" | "manual" | "search";

function normalizeAliasName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeAliasEan(raw?: string | null): string | null {
  const v = raw?.trim().replace(/\s/g, "");
  return v && v.length >= 4 ? v : null;
}

async function upsertAliasRow(input: {
  aliasKey: string;
  aliasType: "name" | "ean";
  productId: number;
  unit?: OrderUnit | null;
  ean?: string | null;
  source: ProductLearnSource;
}) {
  const db = await getDb();
  const now = new Date().toISOString();
  const existing = await dbOne(
    db
      .select()
      .from(productAliases)
      .where(
        and(
          eq(productAliases.aliasKey, input.aliasKey),
          eq(productAliases.aliasType, input.aliasType)
        )
      )
  );

  if (existing) {
    await db
      .update(productAliases)
      .set({
        productId: input.productId,
        unit: input.unit ?? existing.unit,
        ean: input.ean ?? existing.ean,
        learnedFrom: input.source,
        hitCount: (existing.hitCount ?? 1) + 1,
        updatedAt: now,
      })
      .where(eq(productAliases.id, existing.id));
    return;
  }

  await db.insert(productAliases).values({
    aliasKey: input.aliasKey,
    aliasType: input.aliasType,
    productId: input.productId,
    unit: input.unit ?? null,
    ean: input.ean ?? null,
    learnedFrom: input.source,
    hitCount: 1,
    createdAt: now,
    updatedAt: now,
  });
}

/** Remember how the user named / barcoded / unit-tagged a catalog product. */
export async function recordProductLearning(input: {
  productId: number;
  productName?: string | null;
  productEan?: string | null;
  unit?: string | null;
  source?: ProductLearnSource;
}) {
  if (!input.productId) return;

  const source = input.source ?? "order";
  const unit = input.unit
    ? normalizeOrderUnit(input.unit)
    : undefined;
  const ean = normalizeAliasEan(input.productEan);

  const name = input.productName?.trim();
  if (name && name.length >= 3) {
    await upsertAliasRow({
      aliasKey: normalizeAliasName(name),
      aliasType: "name",
      productId: input.productId,
      unit,
      ean,
      source,
    });
  }

  if (ean) {
    await upsertAliasRow({
      aliasKey: ean,
      aliasType: "ean",
      productId: input.productId,
      unit,
      ean,
      source,
    });
  }
}

/** Resolve learned unit from prior user edits / order registrations. */
export async function getLearnedUnitForItem(input: {
  productName?: string | null;
  productEan?: string | null;
}): Promise<OrderUnit | null> {
  const db = await getDb();
  const ean = normalizeAliasEan(input.productEan);
  if (ean) {
    const row = await dbOne(
      db
        .select({ unit: productAliases.unit })
        .from(productAliases)
        .where(
          and(eq(productAliases.aliasType, "ean"), eq(productAliases.aliasKey, ean))
        )
    );
    if (row?.unit) return normalizeOrderUnit(row.unit);
  }

  const name = input.productName?.trim();
  if (name && name.length >= 3) {
    const key = normalizeAliasName(name);
    const row = await dbOne(
      db
        .select({ unit: productAliases.unit })
        .from(productAliases)
        .where(
          and(eq(productAliases.aliasType, "name"), eq(productAliases.aliasKey, key))
        )
    );
    if (row?.unit) return normalizeOrderUnit(row.unit);
  }

  return null;
}

/** Resolve catalog product from learned aliases (invoice OCR name / barcode). */
export async function resolveProductByAlias(input: {
  productName?: string | null;
  productEan?: string | null;
}) {
  const db = await getDb();
  const ean = normalizeAliasEan(input.productEan);
  if (ean) {
    const row = await dbOne(
      db
        .select({ productId: productAliases.productId })
        .from(productAliases)
        .where(
          and(eq(productAliases.aliasType, "ean"), eq(productAliases.aliasKey, ean))
        )
    );
    if (row?.productId) {
      return dbOne(
        db.select().from(products).where(eq(products.id, row.productId))
      );
    }
  }

  const name = input.productName?.trim();
  if (name && name.length >= 3) {
    const key = normalizeAliasName(name);
    const row = await dbOne(
      db
        .select({ productId: productAliases.productId })
        .from(productAliases)
        .where(
          and(eq(productAliases.aliasType, "name"), eq(productAliases.aliasKey, key))
        )
    );
    if (row?.productId) {
      return dbOne(
        db.select().from(products).where(eq(products.id, row.productId))
      );
    }
  }

  return null;
}
