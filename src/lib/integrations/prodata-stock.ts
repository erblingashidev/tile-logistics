/**
 * Pro-Data Finance+ stock report import (Excel export every ~2 days).
 * Expected columns: Shifra, Barkodi, Emertimi, Njesia Matese Baze, Lokacioni, Sasia
 *
 * Uses bulk SQL batches — row-by-row upserts time out on Netlify (~4k products).
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

function unitFromRow(unitRaw: string | null, productName: string | null): OrderUnit {
  const u = (unitRaw ?? "").trim();
  if (/^(m2|m²)$/i.test(u)) return "m2";
  if (u) return normalizeOrderUnit(u);
  if (productName && /\d{2,3}\s*[x×X*]\s*\d{2,3}/.test(productName)) return "m2";
  return normalizeOrderUnit(u || "m2");
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

  type Agg = ProDataStockRow;
  const agg = new Map<string, Agg>();
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

export interface ProDataStockImportResult {
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

const BATCH = 80;

async function runBatches(
  statements: Array<{ sql: string; args: Array<string | number | null> }>
) {
  const client = await getLibsqlClient();
  for (let i = 0; i < statements.length; i += BATCH) {
    const chunk = statements.slice(i, i + BATCH);
    await client.batch(chunk, "write");
  }
}

/**
 * Snapshot-sync Pro-Data stock into warehouse balances (bulk).
 * Same barcode can have different m² at different Pro-Data locations.
 * Only replaces balances on Pro-Data-mapped locations — bin putaways stay.
 */
export async function importProDataStockExcel(
  buffer: Buffer | ArrayBuffer,
  options?: { employeeId?: number }
): Promise<ProDataStockImportResult | { ok: false; error: string }> {
  const started = Date.now();
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

  const db = await getDb();
  const productByBarcode = new Map<string, number>();

  // Chunked lookup avoids huge IN (...) lists on Turso
  const barcodes = [...uniqueByBarcode.keys()];
  for (let i = 0; i < barcodes.length; i += 400) {
    const chunk = barcodes.slice(i, i + 400);
    const found = await dbAll(
      db
        .select({ id: products.id, ean: products.ean })
        .from(products)
        .where(inArray(products.ean, chunk))
    );
    for (const p of found) {
      if (p.ean) productByBarcode.set(p.ean, p.id);
    }
  }

  const now = new Date().toISOString();
  const toInsert: ProDataStockRow[] = [];
  for (const [barcode, row] of uniqueByBarcode) {
    if (!productByBarcode.has(barcode)) toInsert.push(row);
  }

  let productsCreated = 0;
  if (toInsert.length > 0) {
    const insertStmts = toInsert.map((row) => {
      const dims = inferDims(row.productName);
      const unit = unitFromRow(row.unit, row.productName);
      const familyKey = buildFamilyKey({
        productName: row.productName,
        tileWidthCm: dims.width,
        tileHeightCm: dims.height,
      });
      return {
        sql: `INSERT INTO products (
          ean, product_name, unit, tile_width_cm, tile_height_cm,
          family_key, status, source, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'confirmed', 'prodata', ?, ?, ?)
        ON CONFLICT(ean) DO UPDATE SET
          product_name = COALESCE(excluded.product_name, products.product_name),
          unit = excluded.unit,
          updated_at = excluded.updated_at,
          source = CASE WHEN products.source = 'manual' THEN products.source ELSE 'prodata' END`,
        args: [
          row.barcode,
          row.productName,
          unit,
          dims.width ?? null,
          dims.height ?? null,
          familyKey,
          row.articleCode
            ? `Pro-Data shifra ${row.articleCode}`
            : "Imported from Pro-Data stock export",
          now,
          now,
        ] as Array<string | number | null>,
      };
    });
    await runBatches(insertStmts);
    productsCreated = toInsert.length;

    // Refresh ids for barcodes we just inserted
    for (let i = 0; i < toInsert.length; i += 400) {
      const chunk = toInsert.slice(i, i + 400).map((r) => r.barcode);
      const found = await dbAll(
        db
          .select({ id: products.id, ean: products.ean })
          .from(products)
          .where(inArray(products.ean, chunk))
      );
      for (const p of found) {
        if (p.ean) productByBarcode.set(p.ean, p.id);
      }
    }
  }

  // Update names on existing products that we already knew (lightweight batch)
  const updateNameStmts: Array<{
    sql: string;
    args: Array<string | number | null>;
  }> = [];
  for (const [barcode, row] of uniqueByBarcode) {
    if (!toInsert.some((r) => r.barcode === barcode) && row.productName) {
      const id = productByBarcode.get(barcode);
      if (id != null) {
        updateNameStmts.push({
          sql: `UPDATE products SET product_name = COALESCE(?, product_name), updated_at = ? WHERE id = ? AND (product_name IS NULL OR product_name = '')`,
          args: [row.productName, now, id],
        });
      }
    }
  }
  if (updateNameStmts.length > 0) {
    await runBatches(updateNameStmts);
  }

  let negativesClamped = 0;
  const balanceRows: Array<{
    productId: number;
    locationId: number;
    quantityM2: number;
  }> = [];

  for (const row of parsed.rows) {
    const locationId = locationIds.get(row.locationName);
    const productId = productByBarcode.get(row.barcode);
    if (locationId == null || productId == null) continue;
    let qty = row.quantity;
    if (qty < 0) {
      negativesClamped += 1;
      qty = 0;
    }
    balanceRows.push({
      productId,
      locationId,
      quantityM2: Math.round(qty * 100) / 100,
    });
  }

  const touchedLocationIds = [...new Set(locationIds.values())];
  const client = await getLibsqlClient();

  // Snapshot replace on Pro-Data locations only
  let balancesCleared = 0;
  if (touchedLocationIds.length > 0) {
    const before = await dbAll(
      db
        .select({ id: stockBalances.id })
        .from(stockBalances)
        .where(inArray(stockBalances.locationId, touchedLocationIds))
    );
    balancesCleared = before.length;
    const placeholders = touchedLocationIds.map(() => "?").join(",");
    await client.execute({
      sql: `DELETE FROM stock_balances WHERE location_id IN (${placeholders})`,
      args: touchedLocationIds,
    });
  }

  const balanceStmts = balanceRows.map((row) => ({
    sql: `INSERT INTO stock_balances (
      product_id, location_id, quantity_m2, full_pallets, loose_pieces, updated_at
    ) VALUES (?, ?, ?, 0, 0, ?)
    ON CONFLICT(product_id, location_id) DO UPDATE SET
      quantity_m2 = excluded.quantity_m2,
      full_pallets = 0,
      loose_pieces = 0,
      updated_at = excluded.updated_at`,
    args: [row.productId, row.locationId, row.quantityM2, now] as Array<
      string | number | null
    >,
  }));
  await runBatches(balanceStmts);

  const sampleProductId = balanceRows[0]?.productId;
  const sampleLocationId = touchedLocationIds[0];
  if (sampleProductId != null && sampleLocationId != null) {
    await client.execute({
      sql: `INSERT INTO stock_movements (
        product_id, location_id, movement_type, quantity_m2, full_pallets, loose_pieces,
        reference_type, reference_id, employee_id, notes, created_at
      ) VALUES (?, ?, 'prodata_sync', ?, 0, 0, 'prodata_sync', NULL, ?, ?, ?)`,
      args: [
        sampleProductId,
        sampleLocationId,
        Math.round(
          balanceRows.reduce((s, r) => s + r.quantityM2, 0) * 100
        ) / 100,
        options?.employeeId ?? null,
        `Pro-Data Excel sync: ${balanceRows.length} balances across ${touchedLocationIds.length} locations`,
        now,
      ],
    });
  }
  await logActivity(
    "create",
    "stock",
    null,
    `Pro-Data stock import: ${balanceRows.length} balances, ${productsCreated} new products`,
    {
      category: "system",
      details: {
        productsCreated,
        productsUpserted: uniqueByBarcode.size,
        balancesUpdated: balanceRows.length,
        balancesCleared,
        locationsTouched: touchedLocationIds.length,
        rowsImported: parsed.rows.length,
        negativesClamped,
        elapsedMs: Date.now() - started,
      },
    }
  );

  return {
    ok: true,
    productsUpserted: uniqueByBarcode.size,
    productsCreated,
    balancesUpdated: balanceRows.length,
    balancesCleared,
    locationsTouched: touchedLocationIds.length,
    rowsImported: parsed.rows.length,
    negativesClamped,
    warnings: parsed.warnings,
    elapsedMs: Date.now() - started,
  };
}
