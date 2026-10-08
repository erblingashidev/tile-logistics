import {
  LEGACY_AGIMI_ORGANIZATION_ID,
  LEGACY_AGIMI_SLUG,
} from "@/lib/organizations/constants";
import type { SessionUser } from "@/lib/auth/session";

/** First path segments that are never a company slug. */
export const GLOBAL_PATH_SEGMENTS = new Set([
  "login",
  "signup",
  "api",
  "platform",
  "_next",
  "favicon.ico",
]);

export function isGlobalAppPath(pathname: string): boolean {
  if (pathname === "/") return true;
  const seg = pathname.replace(/^\//, "").split("/")[0]?.toLowerCase() ?? "";
  return GLOBAL_PATH_SEGMENTS.has(seg);
}

export function pathUsesTenantPrefix(pathname: string): boolean {
  if (pathname === "/") return true;
  if (isGlobalAppPath(pathname)) return false;
  if (pathname.startsWith("/platform")) return false;
  return true;
}

export type ParsedTenantPath = {
  tenantSlug: string | null;
  pathname: string;
};

/** Split `/{company-slug}/orders` into slug + internal `/orders`. */
export function parseTenantPath(pathname: string): ParsedTenantPath {
  if (pathname === "/" || isGlobalAppPath(pathname)) {
    return { tenantSlug: null, pathname };
  }
  const trimmed = pathname.replace(/^\//, "");
  const slash = trimmed.indexOf("/");
  const first = (slash === -1 ? trimmed : trimmed.slice(0, slash)).toLowerCase();
  if (!first || GLOBAL_PATH_SEGMENTS.has(first)) {
    return { tenantSlug: null, pathname };
  }
  const rest = slash === -1 ? "/" : `/${trimmed.slice(slash + 1)}`;
  return { tenantSlug: first, pathname: rest || "/" };
}

export function tenantPath(slug: string, internalPath: string): string {
  const normalized = internalPath.startsWith("/")
    ? internalPath
    : `/${internalPath}`;
  if (normalized === "/" || normalized === "") {
    return `/${slug}`;
  }
  return `/${slug}${normalized}`;
}

export function resolveSessionTenantSlug(session: SessionUser): string | null {
  if (session.role === "admin") {
    const platformAdmin =
      session.adminId === 0 || session.isPlatformAdmin === true;
    if (platformAdmin && session.organizationId == null) {
      return null;
    }
    if (session.organizationSlug) return session.organizationSlug;
    if (session.organizationId === LEGACY_AGIMI_ORGANIZATION_ID) {
      return LEGACY_AGIMI_SLUG;
    }
    return null;
  }
  if (session.organizationSlug) return session.organizationSlug;
  if (session.organizationId === LEGACY_AGIMI_ORGANIZATION_ID) {
    return LEGACY_AGIMI_SLUG;
  }
  return null;
}

export function tenantPathForSession(
  session: SessionUser,
  internalPath: string
): string {
  const slug = resolveSessionTenantSlug(session);
  if (!slug || !pathUsesTenantPrefix(internalPath)) {
    return internalPath.startsWith("/") ? internalPath : `/${internalPath}`;
  }
  return tenantPath(slug, internalPath);
}
