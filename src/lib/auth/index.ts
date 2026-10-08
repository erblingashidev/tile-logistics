import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { dbOne } from "@/lib/db/query";
import { employees } from "@/lib/db/schema";
import { parseEmployeeRoles } from "@/lib/services/employees";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  createSessionToken,
  sessionCookieOptions,
  verifySessionToken,
  SESSION_COOKIE,
  type SessionUser,
} from "@/lib/auth/session";

import type { EmployeeRole } from "@/lib/constants";
import { loginAdminFromDb } from "@/lib/services/admins";
import { employeeLoginRedirect } from "@/lib/employee-categories";

export async function loginAdmin(
  username: string,
  password: string
): Promise<SessionUser | null> {
  const fromDb = await loginAdminFromDb(username, password);
  if (fromDb) return fromDb;

  const { getAdminCredentials } = await import("@/lib/config/auth-env");
  const admin = getAdminCredentials();
  if (username.trim().toLowerCase() !== admin.username.trim().toLowerCase()) {
    return null;
  }
  if (password !== admin.password) return null;

  return {
    role: "admin",
    adminId: 0,
    name: "Admin",
    username: admin.username.trim().toLowerCase(),
    title: "Administrator",
    organizationId: null,
    isPlatformAdmin: true,
    onboardingComplete: true,
  };
}

export async function loginEmployee(
  username: string,
  password: string
): Promise<SessionUser | null> {
  const normalized = username.trim().toLowerCase();
  const { lookupEmployeeDirectory } = await import(
    "@/lib/services/employee-directory"
  );
  const { getControlPlaneDb, getTenantDataDb } = await import("@/lib/db");
  const { runWithTenantOrganizationAsync } = await import(
    "@/lib/organizations/tenant-context"
  );
  const { enrichSessionWithOrganizationSlug } = await import(
    "@/lib/services/organizations"
  );

  const directory = await lookupEmployeeDirectory(normalized);

  async function employeeFromRow(
    row: typeof employees.$inferSelect,
    organizationId: number
  ): Promise<SessionUser | null> {
    if (!row?.passwordHash) return null;
    if (!verifyPassword(password, row.passwordHash)) return null;
    return enrichSessionWithOrganizationSlug({
      role: "employee",
      employeeId: row.id,
      name: row.name,
      roles: parseEmployeeRoles(row.roles),
      organizationId,
    });
  }

  if (directory) {
    return runWithTenantOrganizationAsync(directory.organizationId, async () => {
      const db = await getTenantDataDb();
      const row = await dbOne(
        db
          .select()
          .from(employees)
          .where(eq(employees.id, directory.employeeId))
      );
      if (!row) return null;
      return employeeFromRow(row, directory.organizationId);
    });
  }

  const db = await getControlPlaneDb();
  const row = await dbOne(
    db
      .select()
      .from(employees)
      .where(eq(employees.username, normalized))
  );
  if (!row) return null;
  const { DEFAULT_ORGANIZATION_ID } = await import(
    "@/lib/organizations/constants"
  );
  const organizationId = row.organizationId ?? DEFAULT_ORGANIZATION_ID;
  return employeeFromRow(row, organizationId);
}

export async function setSessionCookie(user: SessionUser) {
  const token = await createSessionToken(user);
  const jar = await cookies();
  jar.set(sessionCookieOptions().name, token, sessionCookieOptions());
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}

export async function requireAdmin(): Promise<Extract<SessionUser, { role: "admin" }>> {
  const session = await requireSession();
  if (session.role !== "admin") throw new Error("Forbidden");
  const { resolveSessionOrganizationId, bindTenantOrganization } = await import(
    "@/lib/organizations/tenant-context"
  );
  const organizationId = resolveSessionOrganizationId(session);
  if (organizationId) bindTenantOrganization(organizationId);
  return session;
}

export function isPlatformAdmin(
  session: SessionUser
): session is Extract<SessionUser, { role: "admin" }> {
  return (
    session.role === "admin" &&
    (session.adminId === 0 || session.isPlatformAdmin === true)
  );
}

export async function requirePlatformAdmin(): Promise<
  Extract<SessionUser, { role: "admin" }>
> {
  const session = await requireAdmin();
  if (!isPlatformAdmin(session)) throw new Error("Forbidden");
  return session;
}

export async function requireEmployee(): Promise<
  Extract<SessionUser, { role: "employee" }>
> {
  const session = await requireSession();
  if (session.role !== "employee") throw new Error("Forbidden");
  const { resolveSessionOrganizationId, bindTenantOrganization } = await import(
    "@/lib/organizations/tenant-context"
  );
  const organizationId = resolveSessionOrganizationId(session);
  if (organizationId) bindTenantOrganization(organizationId);
  return session;
}

export function employeeHasRole(
  session: Extract<SessionUser, { role: "employee" }>,
  role: EmployeeRole
) {
  return session.roles.includes(role);
}

export function employeeCanUseWms(
  session: Extract<SessionUser, { role: "employee" }>
) {
  return session.roles.some((r) =>
    (["warehouse_admin", "warehouse_reporter", "group_leader", "picker", "unloader", "maintainer"] as EmployeeRole[]).includes(r)
  );
}

export { employeeLoginRedirect };

export { hashPassword, verifySessionToken, SESSION_COOKIE };
