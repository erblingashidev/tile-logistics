import type { SessionUser } from "@/lib/auth/session";

export const PLATFORM_OWNER_USERNAME =
  process.env.PLATFORM_OWNER_USERNAME?.trim().toLowerCase() || "erblingashi";

/** Routes platform admins may use before choosing a company. */
export const PLATFORM_ORG_PICKER_PREFIXES = [
  "/platform/companies",
  "/platform/applications",
  "/api/platform",
  "/api/auth",
] as const;

export function isPlatformAdminUser(
  session: SessionUser | null | undefined
): session is Extract<SessionUser, { role: "admin" }> {
  return (
    session?.role === "admin" &&
    (session.adminId === 0 || session.isPlatformAdmin === true)
  );
}

export function platformAdminNeedsOrgPicker(
  session: SessionUser | null | undefined
): boolean {
  if (!isPlatformAdminUser(session)) return false;
  return session.organizationId == null || session.organizationId <= 0;
}

export function platformOrgPickerPathAllowed(pathname: string): boolean {
  return PLATFORM_ORG_PICKER_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
}
