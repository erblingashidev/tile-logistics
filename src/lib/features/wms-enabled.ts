/** Path helpers for warehouse (WMS) routes. Visibility is controlled in Settings. */

const WMS_ADMIN_PREFIX = "/warehouse";

const WMS_PORTAL_PREFIXES = [
  "/portal/unload",
  "/portal/mapping",
  "/portal/inventory",
  "/portal/wms",
  "/portal/reports",
] as const;

export function isWmsAdminPath(pathname: string): boolean {
  return (
    pathname === WMS_ADMIN_PREFIX ||
    pathname.startsWith(`${WMS_ADMIN_PREFIX}/`)
  );
}

export function isWmsPortalPath(pathname: string): boolean {
  return WMS_PORTAL_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function isWmsApiPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/wms") ||
    pathname.startsWith("/api/portal/warehouse-reports")
  );
}
