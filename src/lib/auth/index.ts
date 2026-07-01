import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
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
import { getAdminCredentials } from "@/lib/config/auth-env";
import { employeeLoginRedirect } from "@/lib/employee-categories";

export async function loginAdmin(
  username: string,
  password: string
): Promise<SessionUser | null> {
  const admin = getAdminCredentials();
  if (username !== admin.username || password !== admin.password) return null;
  return { role: "admin", name: "Admin" };
}

export async function loginEmployee(
  username: string,
  password: string
): Promise<SessionUser | null> {
  const db = await getDb();
  const row = await dbOne(
    db
      .select()
      .from(employees)
      .where(eq(employees.username, username.trim().toLowerCase()))
  );
  if (!row?.passwordHash) return null;
  if (!verifyPassword(password, row.passwordHash)) return null;
  return {
    role: "employee",
    employeeId: row.id,
    name: row.name,
    roles: parseEmployeeRoles(row.roles),
  };
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
  return session;
}

export async function requireEmployee(): Promise<
  Extract<SessionUser, { role: "employee" }>
> {
  const session = await requireSession();
  if (session.role !== "employee") throw new Error("Forbidden");
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
