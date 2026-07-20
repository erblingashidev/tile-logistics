/**
 * Pro-Data Finance+ stock report import (Excel export every ~2 days).
 * Expected columns: Shifra, Barkodi, Emertimi, Njesia Matese Baze, Lokacioni, Sasia
 *
 * Netlify ~10s limit → browser prepares once, then posts small product/balance chunks.
 */
import * as XLSX from "xlsx";
import { inArray } from "drizzle-orm";
import { getDb, getLibsqlClient } from "@/lib/db";
import { dbAll } from "@/lib/db/query";
import { products, stockBalances } from "@/lib/db/schema";
import { normalizeOrderUnit, type OrderUnit } from "@/lib/constants";
import { logActivity } from "@/lib/logger";
import { buildFamilyKey } from "@/lib/product-pallet-spec";
import { getOrCreateWarehouseLocation } from "@/lib/services/stock";

/** Known Pro-Data warehouse area names → stable location codes. */
export const PRODATA_LOCATION_CODES: Record<
  string,
  { code: string; zone: string; label: string }
> = {
  "Depoja Kryesore Shkabaj": {
    code: "PRODATA-MAIN",
    zone: "Pro-Data",
    label: "Depoja Kryesore Shkabaj",
  },
  "Depo e demtuar e re prej 01.09.2025": {
    code: "PRODATA-DAMAGED",
    zone: "Pro-Data",
    label: "Depo e demtuar",
  },
  "Depo e Mallit te Rezervuar": {
    code: "PRODATA-RESERVED",
    zone: "Pro-Data",
    label: "Depo e Mallit te Rezervuar",
  },
};

export interface ProDataStockRow {
  articleCode: string | null;
  barcode: string;
  productName: string | null;
  unit: string | null;
  locationName: string;
  quantity: number;
}

export interface ParsedProDataStock {
  rows: ProDataStockRow[];
  warnings: string[];
  locationNames: string[];
}

export interface ImportProductRow {
  ean: string;
  productName: string | null;
  unit: OrderUnit;
  width: number | null;
  height: number | null;
  articleCode: string | null;
}

export interface ImportBalanceRow {
  ean: string;
  locationId: number;
  quantityM2: number;
}

export interface ProDataImportPayload {
  locationIds: number[];
  products: ImportProductRow[];
  balances: ImportBalanceRow[];
  negativesClamped: number;
  warnings: string[];
}

const SQL_BATCH = 50;

function cellStr(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function cellNum(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(",", ".").replace(/\s/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function slugLocationCode(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return `PD-${slug || "LOC"}`;
}

export function resolveProDataLocation(name: string) {
  const known = PRODATA_LOCATION_CODES[name];
  if (known) return known;
  return {
    code: slugLocationCode(name),
    zone: "Pro-Data",
    label: name.slice(0, 80),
  };
}

function inferDims(name: string | null): { width?: number; height?: number } {
  if (!name) return {};
  const match = name.match(/(\d{2,3})\s*[x×X*]\s*(\d{2,3})/);
  if (!match) return {};
  return { width: Number(match[1]), height: Number(match[2]) };
}

function unitFromRow(
  unitRaw: string | null,
  productName: string | null
): OrderUnit {
  const u = (unitRaw ?? "").trim();
  if (/^(m2|m²)$/i.test(u)) return "m2";
  if (u) return normalizeOrderUnit(u);
  if (productName && /\d{2,3}\s*[x×X*]\s*\d{2,3}/.test(productName)) return "m2";
  return normalizeOrderUnit(u || "m2");
}

async function runBatches(
  statements: Array<{ sql: string; args: Array<string | number | null> }>
) {
  if (statements.length === 0) return;
  const client = await getLibsqlClient();
  for (let i = 0; i < statements.length; i += SQL_BATCH) {
    const chunk = statements.slice(i, i + SQL_BATCH);
    await client.batch(chunk, "write");
  }
}

async function resolveProductIds(
  eans: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (eans.length === 0) return map;
  const db = await getDb();
  for (let i = 0; i < eans.length; i += 300) {
    const chunk = eans.slice(i, i + 300);
    const found = await dbAll(
      db
        .select({ id: products.id, ean: products.ean })
        .from(products)
        .where(inArray(products.ean, chunk))
    );
    for (const p of found) {
      if (p.ean) map.set(p.ean, p.id);
    }
  }
  return map;
}

/** Pure parser — no DB. Aggregates duplicate barcode × location rows. */
export function parseProDataStockExcel(
  buffer: Buffer | ArrayBuffer
): ParsedProDataStock {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const warnings: string[] = [];
  if (!sheetName) {
    return { rows: [], warnings: ["Excel has no sheets."], locationNames: [] };
  }

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets[sheetName],
    { defval: null }
  );
  if (raw.length === 0) {
    return { rows: [], warnings: ["Excel sheet is empty."], locationNames: [] };
  }

  const first = raw[0] ?? {};
  const keys = Object.keys(first);
  const hasBarcode = keys.some((k) => /^barkodi$/i.test(k));
  const hasLoc = keys.some((k) => /^lokacioni$/i.test(k));
  const hasQty = keys.some((k) => /^sasia$/i.test(k));
  if (!hasBarcode || !hasLoc || !hasQty) {
    return {
      rows: [],
      warnings: [
        "Unrecognized Pro-Data stock export. Expected columns: Barkodi, Lokacioni, Sasia (plus Emertimi).",
      ],
      locationNames: [],
    };
  }

  const agg = new Map<string, ProDataStockRow>();
  let skippedNoBarcode = 0;
  let skippedNoLocation = 0;

  for (const row of raw) {
    const barcode =
      cellStr(row["Barkodi"] ?? row["barkodi"]) ??
      cellStr(row["Shifra"] ?? row["shifra"]);
    const locationName = cellStr(row["Lokacioni"] ?? row["lokacioni"]);
    if (!barcode || barcode.length < 2) {
      skippedNoBarcode += 1;
      continue;
    }
    if (!locationName) {
      skippedNoLocation += 1;
      continue;
    }

    const quantity = cellNum(row["Sasia"] ?? row["sasia"]);
    const key = `${barcode}\0${locationName}`;
    const existing = agg.get(key);
    if (existing) {
      existing.quantity += quantity;
    } else {
      agg.set(key, {
        articleCode: cellStr(row["Shifra"] ?? row["shifra"]),
        barcode,
        productName: cellStr(row["Emertimi"] ?? row["emertimi"]),
        unit: cellStr(row["Njesia Matese Baze"] ?? row["Njesia"]),
        locationName,
        quantity,
      });
    }
  }

  if (skippedNoBarcode > 0) {
    warnings.push(`Skipped ${skippedNoBarcode} row(s) without barcode.`);
  }
  if (skippedNoLocation > 0) {
    warnings.push(`Skipped ${skippedNoLocation} row(s) without location.`);
  }

  const rows = [...agg.values()];
  const locationNames = [...new Set(rows.map((r) => r.locationName))].sort();
  return { rows, warnings, locationNames };
}

/** Parse + ensure locations. Returns payload for the browser to apply in chunks. */
export async function prepareProDataImport(
  buffer: Buffer | ArrayBuffer
): Promise<
  | ({ ok: true } & ProDataImportPayload & {
      productCount: number;
      balanceCount: number;
      locationCount: number;
    })
  | { ok: false; error: string }
> {
  const parsed = parseProDataStockExcel(buffer);
  if (parsed.rows.length === 0) {
    return {
      ok: false,
      error: parsed.warnings[0] ?? "No stock rows found in Excel.",
    };
  }

  const locationIds = new Map<string, number>();
  for (const name of parsed.locationNames) {
    const meta = resolveProDataLocation(name);
    const loc = await getOrCreateWarehouseLocation({
      code: meta.code,
      zone: meta.zone,
      label: meta.label,
      notes: `Pro-Data: ${name}`,
    });
    locationIds.set(name, loc!.id);
  }

  const uniqueByBarcode = new Map<string, ProDataStockRow>();
  for (const row of parsed.rows) {
    if (!uniqueByBarcode.has(row.barcode)) {
      uniqueByBarcode.set(row.barcode, row);
    }
  }

  const productRows: ImportProductRow[] = [];
  for (const row of uniqueByBarcode.values()) {
    const dims = inferDims(row.productName);
    productRows.push({
      ean: row.barcode,
      productName: row.productName,
      unit: unitFromRow(row.unit, row.productName),
      width: dims.width ?? null,
      height: dims.height ?? null,
      articleCode: row.articleCode,
    });
  }

  let negativesClamped = 0;
  const balanceRows: ImportBalanceRow[] = [];
  for (const row of parsed.rows) {
    const locationId = locationIds.get(row.locationName);
    if (locationId == null) continue;
    let qty = row.quantity;
    if (qty < 0) {
      negativesClamped += 1;
      qty = 0;
    }
    balanceRows.push({
      ean: row.barcode,
      locationId,
      quantityM2: Math.round(qty * 100) / 100,
    });
  }

  const ids = [...new Set(locationIds.values())];
  return {
    ok: true,
    locationIds: ids,
    products: productRows,
    balances: balanceRows,
    negativesClamped,
    warnings: parsed.warnings,
    productCount: productRows.length,
    balanceCount: balanceRows.length,
    locationCount: ids.length,
  };
}

export async function importProDataProductsChunk(
  rows: ImportProductRow[]
): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: true, created: 0 };
  }
  if (rows.length > 200) {
    return { ok: false, error: "Product chunk too large (max 200)." };
  }

  const now = new Date().toISOString();
  const existing = await resolveProductIds(rows.map((r) => r.ean));
  const toInsert = rows.filter((r) => r.ean && !existing.has(r.ean));
  if (toInsert.length === 0) return { ok: true, created: 0 };

  const stmts = toInsert.map((row) => {
    const familyKey = buildFamilyKey({
      productName: row.productName,
      tileWidthCm: row.width,
      tileHeightCm: row.height,
    });
    return {
      sql: `INSERT INTO products (
        ean, product_name, unit, tile_width_cm, tile_height_cm,
        family_key, status, source, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'confirmed', 'prodata', ?, ?, ?)
      ON CONFLICT(ean) DO UPDATE SET
        product_name = COALESCE(excluded.product_name, products.product_name),
        updated_at = excluded.updated_at`,
      args: [
        row.ean,
        row.productName,
        row.unit || "m2",
        row.width,
        row.height,
        familyKey,
        row.articleCode
          ? `Pro-Data shifra ${row.articleCode}`
          : "Imported from Pro-Data stock export",
        now,
        now,
      ] as Array<string | number | null>,
    };
  });
  await runBatches(stmts);
  return { ok: true, created: toInsert.length };
}

export async function clearProDataBalances(
  locationIds: number[]
): Promise<{ ok: true; cleared: number } | { ok: false; error: string }> {
  if (!Array.isArray(locationIds) || locationIds.length === 0) {
    return { ok: true, cleared: 0 };
  }
  const db = await getDb();
  const client = await getLibsqlClient();
  const before = await dbAll(
    db
      .select({ id: stockBalances.id })
      .from(stockBalances)
      .where(inArray(stockBalances.locationId, locationIds))
  );
  const placeholders = locationIds.map(() => "?").join(",");
  await client.execute({
    sql: `DELETE FROM stock_balances WHERE location_id IN (${placeholders})`,
    args: locationIds,
  });
  return { ok: true, cleared: before.length };
}

export async function importProDataBalancesChunk(
  rows: ImportBalanceRow[]
): Promise<{ ok: true; written: number } | { ok: false; error: string }> {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: true, written: 0 };
  }
  if (rows.length > 250) {
    return { ok: false, error: "Balance chunk too large (max 250)." };
  }

  const now = new Date().toISOString();
  const ids = await resolveProductIds(rows.map((r) => r.ean));
  const stmts = rows
    .map((row) => {
      const productId = ids.get(row.ean);
      if (productId == null) return null;
      return {
        sql: `INSERT INTO stock_balances (
          product_id, location_id, quantity_m2, full_pallets, loose_pieces, updated_at
        ) VALUES (?, ?, ?, 0, 0, ?)
        ON CONFLICT(product_id, location_id) DO UPDATE SET
          quantity_m2 = excluded.quantity_m2,
          full_pallets = 0,
          loose_pieces = 0,
          updated_at = excluded.updated_at`,
        args: [
          productId,
          row.locationId,
          row.quantityM2,
          now,
        ] as Array<string | number | null>,
      };
    })
    .filter(Boolean) as Array<{
    sql: string;
    args: Array<string | number | null>;
  }>;

  await runBatches(stmts);
  return { ok: true, written: stmts.length };
}

export async function finishProDataImport(input: {
  locationIds: number[];
  productsCreated: number;
  balancesWritten: number;
  balancesCleared: number;
  balanceCount: number;
  productCount: number;
  negativesClamped: number;
  warnings: string[];
  sampleEan?: string;
}): Promise<{ ok: true }> {
  const client = await getLibsqlClient();
  const now = new Date().toISOString();
  const sample =
    input.sampleEan != null
      ? await resolveProductIds([input.sampleEan])
      : new Map<string, number>();
  const sampleProductId = input.sampleEan
    ? sample.get(input.sampleEan)
    : undefined;
  const sampleLocationId = input.locationIds[0];
  if (sampleProductId != null && sampleLocationId != null) {
    await client.execute({
      sql: `INSERT INTO stock_movements (
        product_id, location_id, movement_type, quantity_m2, full_pallets, loose_pieces,
        reference_type, reference_id, employee_id, notes, created_at
      ) VALUES (?, ?, 'prodata_sync', ?, 0, 0, 'prodata_sync', NULL, NULL, ?, ?)`,
      args: [
        sampleProductId,
        sampleLocationId,
        input.balancesWritten,
        `Pro-Data Excel sync: ${input.balancesWritten} balances · ${input.productsCreated} new products`,
        now,
      ],
    });
  }

  await logActivity(
    "create",
    "stock",
    null,
    `Pro-Data stock import: ${input.balancesWritten} balances, ${input.productsCreated} new products`,
    {
      category: "system",
      details: {
        productsCreated: input.productsCreated,
        productsUpserted: input.productCount,
        balancesUpdated: input.balancesWritten,
        balancesCleared: input.balancesCleared,
        locationsTouched: input.locationIds.length,
        rowsImported: input.balanceCount,
        negativesClamped: input.negativesClamped,
        warnings: input.warnings,
      },
    }
  );
  return { ok: true };
}

/** Full import for scripts/tests. */
export async function importProDataStockExcel(
  buffer: Buffer | ArrayBuffer
): Promise<
  | {
      ok: true;
      productsUpserted: number;
      productsCreated: number;
      balancesUpdated: number;
      balancesCleared: number;
      locationsTouched: number;
      rowsImported: number;
      negativesClamped: number;
      warnings: string[];
      elapsedMs: number;
    }
  | { ok: false; error: string }
> {
  const started = Date.now();
  const prepared = await prepareProDataImport(buffer);
  if (!prepared.ok) return prepared;

  let productsCreated = 0;
  for (let i = 0; i < prepared.products.length; i += 120) {
    const chunk = prepared.products.slice(i, i + 120);
    const r = await importProDataProductsChunk(chunk);
    if (!r.ok) return r;
    productsCreated += r.created;
  }

  const cleared = await clearProDataBalances(prepared.locationIds);
  if (!cleared.ok) return cleared;

  let balancesWritten = 0;
  for (let i = 0; i < prepared.balances.length; i += 180) {
    const chunk = prepared.balances.slice(i, i + 180);
    const r = await importProDataBalancesChunk(chunk);
    if (!r.ok) return r;
    balancesWritten += r.written;
  }

  await finishProDataImport({
    locationIds: prepared.locationIds,
    productsCreated,
    balancesWritten,
    balancesCleared: cleared.cleared,
    balanceCount: prepared.balanceCount,
    productCount: prepared.productCount,
    negativesClamped: prepared.negativesClamped,
    warnings: prepared.warnings,
    sampleEan: prepared.balances[0]?.ean,
  });

  return {
    ok: true,
    productsUpserted: prepared.productCount,
    productsCreated,
    balancesUpdated: balancesWritten,
    balancesCleared: cleared.cleared,
    locationsTouched: prepared.locationCount,
    rowsImported: prepared.balanceCount,
    negativesClamped: prepared.negativesClamped,
    warnings: prepared.warnings,
    elapsedMs: Date.now() - started,
  };
}
