import type { SessionUser } from "@/lib/auth/session";
import { DEFAULT_ORGANIZATION_ID } from "@/lib/organizations/constants";

/** Set on authenticated requests — org id when known from session. */
export const ORGANIZATION_ID_HEADER = "x-organization-id";

/** Set from URL slug when session has no org id (resolved on Node server routes, not edge). */
export const ORGANIZATION_SLUG_HEADER = "x-organization-slug";

/** Resolve org id from an authenticated session (no DB — safe for edge proxy). */
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
