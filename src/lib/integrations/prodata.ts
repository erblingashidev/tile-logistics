/**
 * Pro-Data Finance+ integration placeholder.
 * See docs/PRODATA-INTEGRATION.md — contact Pro-Data for API/export options.
 */

export interface ProDataSyncResult {
  ok: boolean;
  message: string;
  imported?: number;
}

export async function syncProductsFromProData(): Promise<ProDataSyncResult> {
  if (!process.env.PRODATA_API_URL) {
    return {
      ok: false,
      message:
        "Pro-Data not configured. Set PRODATA_API_URL after agreeing integration with Pro-Data.",
    };
  }
  return {
    ok: false,
    message: "Pro-Data sync not implemented yet.",
  };
}
