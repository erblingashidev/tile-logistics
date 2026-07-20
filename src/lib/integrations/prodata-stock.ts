/**
 * Pro-Data Finance+ stock report import (Excel export every ~2 days).
 * Expected columns: Shifra, Barkodi, Emertimi, Njesia Matese Baze, Lokacioni, Sasia
 */
import * as XLSX from "xlsx";
import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll } from "@/lib/db/query";
import { stockBalances } from "@/lib/db/schema";
import { normalizeOrderUnit } from "@/lib/constants";
import { logActivity } from "@/lib/logger";
import { upsertProduct } from "@/lib/services/products";
import {
  getOrCreateWarehouseLocation,
  setStockBalanceAbsolute,
} from "@/lib/services/stock";

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

/** Pure parser — no DB. Aggregates duplicate barcode × location rows. */
export function parseProDataStockExcel(buffer: Buffer | ArrayBuffer): ParsedProDataStock {
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
  balancesUpdated: number;
  balancesZeroed: number;
  locationsTouched: number;
  rowsImported: number;
  negativesClamped: number;
  warnings: string[];
}

/**
 * Snapshot-sync Pro-Data stock into warehouse balances.
 * - Same barcode can have different m² at different Pro-Data locations.
 * - Only touches Pro-Data-mapped locations (bin putaway locations are left alone).
 * - Missing products at a touched Pro-Data location are zeroed.
 */
export async function importProDataStockExcel(
  buffer: Buffer | ArrayBuffer,
  options?: { employeeId?: number }
): Promise<ProDataStockImportResult | { ok: false; error: string }> {
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

  let productsUpserted = 0;
  let balancesUpdated = 0;
  let negativesClamped = 0;
  const productByBarcode = new Map<string, number>();
  const importedKeys = new Set<string>();

  for (const row of parsed.rows) {
    const locationId = locationIds.get(row.locationName);
    if (locationId == null) continue;

    let productId = productByBarcode.get(row.barcode);
    if (productId == null) {
      const unitRaw = (row.unit ?? "").trim();
      const unit = normalizeOrderUnit(
        /^(m2|m²)$/i.test(unitRaw) ? "m2" : unitRaw || "m2"
      );
      const product = await upsertProduct({
        ean: row.barcode,
        productName: row.productName,
        unit,
        source: "prodata",
        status: "confirmed",
        notes: row.articleCode
          ? `Pro-Data shifra ${row.articleCode}`
          : "Imported from Pro-Data stock export",
        asNewLot: true,
      });
      if (!product) continue;
      productId = product.id;
      productByBarcode.set(row.barcode, productId);
      productsUpserted += 1;
    }

    let qty = row.quantity;
    if (qty < 0) {
      negativesClamped += 1;
      qty = 0;
    }

    await setStockBalanceAbsolute({
      productId,
      locationId,
      quantityM2: Math.round(qty * 100) / 100,
      employeeId: options?.employeeId,
      notes: `Pro-Data sync · ${row.locationName}`,
      referenceType: "prodata_sync",
    });
    balancesUpdated += 1;
    importedKeys.add(`${productId}:${locationId}`);
  }

  // Zero balances at touched Pro-Data locations that are no longer in the file
  const touchedLocationIds = [...new Set(locationIds.values())];
  const db = await getDb();
  const existingAtTouched =
    touchedLocationIds.length > 0
      ? await dbAll(
          db
            .select({
              id: stockBalances.id,
              productId: stockBalances.productId,
              locationId: stockBalances.locationId,
              quantityM2: stockBalances.quantityM2,
            })
            .from(stockBalances)
            .where(inArray(stockBalances.locationId, touchedLocationIds))
        )
      : [];

  let balancesZeroed = 0;
  for (const bal of existingAtTouched) {
    const key = `${bal.productId}:${bal.locationId}`;
    if (importedKeys.has(key)) continue;
    if ((bal.quantityM2 ?? 0) === 0) continue;
    await setStockBalanceAbsolute({
      productId: bal.productId,
      locationId: bal.locationId,
      quantityM2: 0,
      employeeId: options?.employeeId,
      notes: "Pro-Data sync — missing from export (zeroed)",
      referenceType: "prodata_sync",
    });
    balancesZeroed += 1;
  }

  await logActivity(
    "create",
    "stock",
    null,
    `Pro-Data stock import: ${balancesUpdated} balances, ${productsUpserted} products`,
    {
      category: "system",
      details: {
        productsUpserted,
        balancesUpdated,
        balancesZeroed,
        locationsTouched: touchedLocationIds.length,
        rowsImported: parsed.rows.length,
        negativesClamped,
      },
    }
  );

  return {
    ok: true,
    productsUpserted,
    balancesUpdated,
    balancesZeroed,
    locationsTouched: touchedLocationIds.length,
    rowsImported: parsed.rows.length,
    negativesClamped,
    warnings: parsed.warnings,
  };
}
