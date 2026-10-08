import type { SessionUser } from "@/lib/auth/session";
import { isPlatformAdminUser } from "@/lib/auth/platform-admin";
import { TenantAccessError } from "@/lib/organizations/tenant-access-error";
import { resolveSessionOrganizationId } from "@/lib/organizations/tenant-context";

export function sessionCanAccessOrganization(
  session: SessionUser,
  organizationId: number
): boolean {
  if (!Number.isFinite(organizationId) || organizationId <= 0) return false;

  if (session.role === "admin") {
    if (isPlatformAdminUser(session)) {
      const active = resolveSessionOrganizationId(session);
      return active === organizationId;
    }
    const own = resolveSessionOrganizationId(session);
    return own === organizationId;
  }

  if (session.role === "employee") {
    return session.organizationId === organizationId;
  }

  return false;
}

export function assertSessionCanAccessOrganization(
  session: SessionUser,
  organizationId: number
): void {
  if (!sessionCanAccessOrganization(session, organizationId)) {
    throw new TenantAccessError();
  }
}
