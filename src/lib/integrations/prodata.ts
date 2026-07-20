/**
 * Pro-Data Finance+ integration.
 * See docs/PRODATA-INTEGRATION.md.
 */

export interface ProDataSyncResult {
  ok: boolean;
  message: string;
  imported?: number;
}

/** API sync is not available — use Excel stock import on Warehouse → Stock. */
export async function syncProductsFromProData(): Promise<ProDataSyncResult> {
  return {
    ok: false,
    message:
      "Use Warehouse → Stock → Import Pro-Data .xlsx (stock report export every ~2 days).",
  };
}

export {
  importProDataStockExcel,
  parseProDataStockExcel,
} from "@/lib/integrations/prodata-stock";
