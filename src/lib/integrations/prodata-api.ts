/**
 * Pro-Data REST API — fetch stock/catalog and map to internal import rows.
 */
import { getProDataApiConfig } from "@/lib/config/prodata-env";
import {
  proDataFetch,
  proDataFetchAllPages,
  type ProDataFetchOptions,
} from "@/lib/integrations/prodata-client";
import type { ParsedProDataStock, ProDataStockRow } from "@/lib/integrations/prodata-stock";

export interface ProDataWarehouseStock {
  warehouse: string;
  quantityAvailable: number;
}

export interface ProDataItemsStokuRow {
  sortID?: number;
  code: string;
  barcode: string;
  description: string;
  emertimiiDyte?: string;
  brand?: string;
  klasifikimi1?: string;
  klasifikimi2?: string;
  price?: number;
  vat?: number;
  priceAfterDiscount?: number;
  warehouses: ProDataWarehouseStock[];
}

export interface ProDataItemRow {
  sortID?: number;
  code: string;
  barcode: string;
  description: string;
  vendorCode?: string;
  vendorDescription?: string;
  klasifikimi1?: string;
  klasifikimi2?: string;
  price?: number;
  priceAfterDiscount?: number;
}

export interface ProDataBulkOrderItem {
  ArtikulliID?: number;
  ItemCode?: string;
  Quantity: number;
  Price?: number;
  Discount?: number;
  PriceAfterDiscount?: number;
  VariantCode1?: string;
  VariantCode2?: string;
}

export interface ProDataPostOrderResult {
  hasError?: boolean;
  errorMsg?: string | null;
  returnData?: string | null;
  returnText?: string | null;
}

/** Flatten ItemsStoku API rows → same shape as Excel parser output. */
export function parseProDataItemsStoku(
  items: ProDataItemsStokuRow[]
): ParsedProDataStock {
  const warnings: string[] = [];
  const agg = new Map<string, ProDataStockRow>();
  let skippedNoBarcode = 0;
  let skippedNoWarehouse = 0;

  for (const item of items) {
    const barcode = (item.barcode || item.code || "").trim();
    if (!barcode || barcode.length < 2) {
      skippedNoBarcode += 1;
      continue;
    }

    const warehouses = item.warehouses ?? [];
    if (warehouses.length === 0) {
      skippedNoWarehouse += 1;
      continue;
    }

    for (const wh of warehouses) {
      const locationName = (wh.warehouse ?? "").trim();
      if (!locationName) {
        skippedNoWarehouse += 1;
        continue;
      }
      const quantity = Number(wh.quantityAvailable) || 0;
      const key = `${barcode}\0${locationName}`;
      const existing = agg.get(key);
      if (existing) {
        existing.quantity += quantity;
      } else {
        agg.set(key, {
          articleCode: item.code?.trim() || null,
          barcode,
          productName: item.description?.trim() || null,
          unit: null,
          locationName,
          quantity,
        });
      }
    }
  }

  if (skippedNoBarcode > 0) {
    warnings.push(`Skipped ${skippedNoBarcode} item(s) without barcode.`);
  }
  if (skippedNoWarehouse > 0) {
    warnings.push(`Skipped ${skippedNoWarehouse} row(s) without warehouse.`);
  }

  const rows = [...agg.values()];
  const locationNames = [...new Set(rows.map((r) => r.locationName))].sort();
  return { rows, warnings, locationNames };
}

export async function fetchProDataItemsStoku(
  options?: ProDataFetchOptions & { itemCode?: string }
): Promise<ProDataItemsStokuRow[]> {
  const config = options?.config ?? getProDataApiConfig();
  if (!config) {
    throw new Error("Pro-Data API is not configured.");
  }

  return proDataFetchAllPages<ProDataItemsStokuRow>(
    "/ProDataRestAPI/ItemsStoku",
    {
      username: config.username,
      ItemCode: options?.itemCode ?? "All",
    },
    { config, rowsPerPage: 100 }
  );
}

export async function fetchProDataItems(
  options?: ProDataFetchOptions
): Promise<ProDataItemRow[]> {
  const config = options?.config ?? getProDataApiConfig();
  if (!config) {
    throw new Error("Pro-Data API is not configured.");
  }

  return proDataFetchAllPages<ProDataItemRow>(
    "/ProDataRestAPI/Items",
    {
      username: config.username,
      filter: "All",
      category: "All",
      subCategory: "All",
      brand: "All",
    },
    { config, rowsPerPage: 100 }
  );
}

/** Push a bulk order to Pro-Data (decrements stock on their side when accepted). */
export async function postProDataBulkOrder(
  items: ProDataBulkOrderItem[],
  options?: ProDataFetchOptions
): Promise<ProDataPostOrderResult> {
  const config = options?.config ?? getProDataApiConfig();
  if (!config) {
    throw new Error("Pro-Data API is not configured.");
  }
  if (items.length === 0) {
    throw new Error("Order has no line items to send to Pro-Data.");
  }

  return proDataFetch<ProDataPostOrderResult>("/ProDataRestAPI/B2BPostBulkOrder", {
    config,
    method: "POST",
    params: {
      username: config.username,
      orderItemsJson: JSON.stringify(items),
    },
  });
}

export interface ProDataConnectionTestResult {
  ok: boolean;
  message: string;
  itemCount?: number;
  stockRowCount?: number;
  warehouses?: string[];
}

/** Lightweight connectivity check — does not write to tile-logistics DB. */
export async function testProDataConnection(): Promise<ProDataConnectionTestResult> {
  const config = getProDataApiConfig();
  if (!config) {
    return {
      ok: false,
      message:
        "Pro-Data sync is disabled. Set PRODATA_SYNC_ENABLED=true and API credentials.",
    };
  }

  const stock = await fetchProDataItemsStoku({ config, itemCode: "All" });
  const parsed = parseProDataItemsStoku(stock);
  const warehouses = [...new Set(parsed.rows.map((r) => r.locationName))].sort();

  return {
    ok: true,
    message: `Connected. ${stock.length} item(s), ${parsed.rows.length} stock line(s).`,
    itemCount: stock.length,
    stockRowCount: parsed.rows.length,
    warehouses,
  };
}
