import { AsyncLocalStorage } from "async_hooks";
import { headers } from "next/headers";
import type { SessionUser } from "@/lib/auth/session";
import { DEFAULT_ORGANIZATION_ID } from "@/lib/organizations/constants";

/** Set on every authenticated request by proxy from the session tenant. */
export const ORGANIZATION_ID_HEADER = "x-organization-id";

const tenantStorage = new AsyncLocalStorage<number>();

export class TenantRequiredError extends Error {
  constructor(message = "Select a company before accessing this data.") {
    super(message);
    this.name = "TenantRequiredError";
  }
}

/** Resolve org id from an authenticated session (no AsyncLocalStorage). */
export function resolveSessionOrganizationId(
  session: SessionUser
): number | null {
  if (session.role === "admin") {
    const platformAdmin =
      session.adminId === 0 || session.isPlatformAdmin === true;
    if (platformAdmin) {
      return session.organizationId != null && session.organizationId > 0
        ? session.organizationId
        : null;
    }
    return session.organizationId ?? DEFAULT_ORGANIZATION_ID;
  }
  if (session.role === "employee") {
    return session.organizationId != null && session.organizationId > 0
      ? session.organizationId
      : null;
  }
  return null;
}

/** Bind tenant for the remainder of the current async request. */
export function bindTenantOrganization(organizationId: number): void {
  if (!Number.isFinite(organizationId) || organizationId <= 0) {
    throw new TenantRequiredError();
  }
  tenantStorage.enterWith(organizationId);
}

export function runWithTenantOrganization<T>(
  organizationId: number,
  fn: () => T
): T {
  return tenantStorage.run(organizationId, fn);
}

/** Current request tenant — required for all tenant-owned data access. */
export function getTenantOrganizationId(): number {
  const orgId = tenantStorage.getStore();
  if (orgId != null && orgId > 0) return orgId;
  throw new TenantRequiredError();
}

/** Async tenant resolution (falls back to proxy-injected request header). */
export async function resolveTenantOrganizationId(): Promise<number> {
  const orgId = tenantStorage.getStore();
  if (orgId != null && orgId > 0) return orgId;
  try {
    const h = await headers();
    const raw = h.get(ORGANIZATION_ID_HEADER);
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  } catch {
    /* outside request scope */
  }
  throw new TenantRequiredError();
}

/** Run async work with a reliable tenant scope (prefer over enterWith in route handlers). */
export function runWithTenantOrganizationAsync<T>(
  organizationId: number,
  fn: () => Promise<T>
): Promise<T> {
  if (!Number.isFinite(organizationId) || organizationId <= 0) {
    return Promise.reject(new TenantRequiredError());
  }
  return tenantStorage.run(organizationId, fn);
}

/** Optional tenant — returns null when not bound (internal scripts only). */
export function tryGetTenantOrganizationId(): number | null {
  const orgId = tenantStorage.getStore();
  return orgId != null && orgId > 0 ? orgId : null;
}
