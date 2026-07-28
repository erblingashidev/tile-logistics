/**
 * Pro-Data Finance+ integration.
 * See docs/PRODATA-INTEGRATION.md.
 */
import { isProDataSyncEnabled } from "@/lib/config/prodata-env";
import {
  fetchProDataItemsStoku,
  parseProDataItemsStoku,
  postProDataBulkOrder,
  testProDataConnection,
  type ProDataBulkOrderItem,
} from "@/lib/integrations/prodata-api";
import {
  importProDataStockExcel,
  parseProDataStockExcel,
  prepareProDataImportFromApi,
} from "@/lib/integrations/prodata-stock";

export interface ProDataSyncResult {
  ok: boolean;
  message: string;
  imported?: number;
}

/** Pull stock from Pro-Data API into local DB (full import — use chunked route in UI). */
export async function syncProductsFromProData(): Promise<ProDataSyncResult> {
  if (!isProDataSyncEnabled()) {
    return {
      ok: false,
      message:
        "Pro-Data API sync is disabled. Set PRODATA_SYNC_ENABLED=true or use Excel import.",
    };
  }

  try {
    const prep = await prepareProDataImportFromApi();
    if (!prep.ok) {
      return { ok: false, message: prep.error };
    }
    return {
      ok: true,
      message: `Prepared ${prep.productCount} products, ${prep.balanceCount} stock lines from Pro-Data API.`,
      imported: prep.balanceCount,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Pro-Data API sync failed.";
    return { ok: false, message };
  }
}

export {
  fetchProDataItemsStoku,
  importProDataStockExcel,
  parseProDataItemsStoku,
  parseProDataStockExcel,
  postProDataBulkOrder,
  prepareProDataImportFromApi,
  testProDataConnection,
  type ProDataBulkOrderItem,
};
