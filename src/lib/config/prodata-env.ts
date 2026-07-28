/**
 * Pro-Data REST API configuration (server-side only).
 * Set PRODATA_SYNC_ENABLED=true only when you intend to pull from Pro-Data.
 */

export interface ProDataApiConfig {
  baseUrl: string;
  username: string;
  password: string;
}

export function getProDataApiConfig(): ProDataApiConfig | null {
  if (!isProDataSyncEnabled()) return null;

  const baseUrl = process.env.PRODATA_API_URL?.trim().replace(/\/$/, "");
  const username = process.env.PRODATA_API_USERNAME?.trim();
  const password = process.env.PRODATA_API_PASSWORD?.trim();

  if (!baseUrl || !username || !password) {
    throw new Error(
      "Pro-Data sync is enabled but PRODATA_API_URL, PRODATA_API_USERNAME, or PRODATA_API_PASSWORD is missing."
    );
  }

  return { baseUrl, username, password };
}

/** Must be explicitly true — prevents accidental sync against test/production API. */
export function isProDataSyncEnabled(): boolean {
  return process.env.PRODATA_SYNC_ENABLED === "true";
}

/** When true, creating an order decrements stock at PRODATA-MAIN (local WMS only). */
export function isProDataOrderStockIssueEnabled(): boolean {
  return process.env.PRODATA_ISSUE_STOCK_ON_ORDER === "true";
}

/** When true, new orders are pushed to Pro-Data via B2BPostBulkOrder (their stock). */
export function isProDataPushOrdersEnabled(): boolean {
  return process.env.PRODATA_PUSH_ORDERS === "true";
}
