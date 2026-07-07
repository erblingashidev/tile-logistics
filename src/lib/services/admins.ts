import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll, dbOne } from "@/lib/db/query";
import { admins, employees } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { getAdminCredentials } from "@/lib/config/auth-env";
import type { EmployeeRole } from "@/lib/constants";
import {
  ADMIN_EMPLOYEE_ROLE_OPTIONS,
  defaultTitleForAdminRole,
  inferEmployeeRoleForAdmin,
} from "@/lib/admin-roles";
import {
  parseEmployeeRoles,
  serializeEmployeeRoles,
} from "@/lib/services/employees";
import { logActivity } from "@/lib/logger";
import type { SessionUser } from "@/lib/auth/session";

export const MIN_ADMIN_PASSWORD_LENGTH = 6;

export { ADMIN_EMPLOYEE_ROLE_OPTIONS, inferEmployeeRoleForAdmin } from "@/lib/admin-roles";

export class AdminCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminCredentialError";
  }
}

export interface AdminPayload {
  name: string;
  username: string;
  password?: string;
  title?: string | null;
  email?: string | null;
  employeeRole?: EmployeeRole;
  isActive?: boolean;
}

export interface AdminProfile {
  id: number;
  name: string;
  username: string;
  title: string | null;
  email: string | null;
  employeeId: number | null;
  employeeRole: EmployeeRole | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function mapAdminRow(
  row: typeof admins.$inferSelect,
  employeeRole: EmployeeRole | null = null
): AdminProfile {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    title: row.title ?? null,
    email: row.email ?? null,
    employeeId: row.employeeId ?? null,
    employeeRole,
    isActive: row.isActive === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastLoginAt: row.lastLoginAt ?? null,
  };
}

async function employeeRoleForAdmin(adminId: number, employeeId: number | null) {
  if (!employeeId) return null;
  const db = await getDb();
  const row = await dbOne(
    db.select({ roles: employees.roles }).from(employees).where(eq(employees.id, employeeId))
  );
  if (!row) return null;
  const roles = parseEmployeeRoles(row.roles);
  return (
    roles.find((role) =>
      ADMIN_EMPLOYEE_ROLE_OPTIONS.some((option) => option.role === role)
    ) ??
    roles[0] ??
    null
  );
}

async function loadAdminProfile(id: number): Promise<AdminProfile | null> {
  const db = await getDb();
  const row = await dbOne(db.select().from(admins).where(eq(admins.id, id)));
  if (!row) return null;
  const employeeRole = await employeeRoleForAdmin(id, row.employeeId ?? null);
  return mapAdminRow(row, employeeRole);
}

async function assertUsernameAvailable(username: string, excludeAdminId?: number) {
  const normalized = normalizeUsername(username);
  const adminConditions = [eq(admins.username, normalized)];
  if (excludeAdminId != null) {
    adminConditions.push(ne(admins.id, excludeAdminId));
  }

  const db = await getDb();
  const existingAdmin = await dbOne(
    db
      .select({ id: admins.id })
      .from(admins)
      .where(and(...adminConditions))
  );
  if (existingAdmin) {
    throw new AdminCredentialError("Username is already used by an admin account");
  }

  const existingEmployee = await dbOne(
    db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.username, normalized))
  );
  if (existingEmployee) {
    if (excludeAdminId != null) {
      const linked = await dbOne(
        db
          .select({ id: admins.id })
          .from(admins)
          .where(
            and(
              eq(admins.id, excludeAdminId),
              eq(admins.employeeId, existingEmployee.id)
            )
          )
      );
      if (linked) return;
    }
    throw new AdminCredentialError("Username is already used by an employee account");
  }
}

function validatePassword(password: string | undefined, required: boolean) {
  const trimmed = password?.trim() ?? "";
  if (!trimmed) {
    if (required) throw new AdminCredentialError("Password is required");
    return null;
  }
  if (trimmed.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new AdminCredentialError(
      `Password must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters`
    );
  }
  return trimmed;
}

async function createLinkedEmployee(input: {
  name: string;
  username: string;
  passwordHash: string;
  title: string | null;
  employeeRole: EmployeeRole;
}) {
  const db = await getDb();
  const now = new Date().toISOString();
  const inserted = await dbOne(
    db
      .insert(employees)
      .values({
        name: input.name,
        status: "off_duty",
        roles: serializeEmployeeRoles([input.employeeRole]),
        title: input.title,
        username: input.username,
        passwordHash: input.passwordHash,
        notes: "Management — linked dashboard admin account",
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: employees.id })
  );
  if (!inserted) throw new Error("Failed to create linked employee");
  return inserted.id;
}

async function syncLinkedEmployee(
  adminRow: typeof admins.$inferSelect,
  updates: {
    name?: string;
    username?: string;
    passwordHash?: string;
    title?: string | null;
    employeeRole?: EmployeeRole;
    isActive?: boolean;
  }
) {
  const db = await getDb();
  const now = new Date().toISOString();
  const employeeRole =
    updates.employeeRole ??
    inferEmployeeRoleForAdmin(updates.title ?? adminRow.title, undefined);
  const displayTitle =
    updates.title !== undefined
      ? updates.title
      : adminRow.title ?? defaultTitleForAdminRole(employeeRole);

  if (!adminRow.employeeId) {
    const employeeId = await createLinkedEmployee({
      name: updates.name ?? adminRow.name,
      username: updates.username ?? adminRow.username,
      passwordHash: updates.passwordHash ?? adminRow.passwordHash,
      title: displayTitle,
      employeeRole,
    });
    await db
      .update(admins)
      .set({ employeeId, updatedAt: now })
      .where(eq(admins.id, adminRow.id));
    return employeeId;
  }

  const employeeUpdates: Partial<typeof employees.$inferInsert> = {
    updatedAt: now,
  };
  if (updates.name != null) employeeUpdates.name = updates.name;
  if (updates.username != null) employeeUpdates.username = updates.username;
  if (updates.passwordHash != null) employeeUpdates.passwordHash = updates.passwordHash;
  if (updates.title !== undefined || adminRow.title) {
    employeeUpdates.title = displayTitle;
  }
  if (updates.employeeRole) {
    employeeUpdates.roles = serializeEmployeeRoles([updates.employeeRole]);
  }
  if (updates.isActive === false) {
    employeeUpdates.username = null;
    employeeUpdates.passwordHash = null;
  } else if (updates.isActive === true) {
    employeeUpdates.username = updates.username ?? adminRow.username;
    employeeUpdates.passwordHash = updates.passwordHash ?? adminRow.passwordHash;
  }

  await db
    .update(employees)
    .set(employeeUpdates)
    .where(eq(employees.id, adminRow.employeeId));

  return adminRow.employeeId;
}

export async function backfillAdminEmployeeLinks() {
  const db = await getDb();
  const rows = await dbAll(
    db.select().from(admins).where(isNull(admins.employeeId))
  );
  for (const row of rows) {
    const employeeRole = inferEmployeeRoleForAdmin(row.title);
    const title = row.title ?? defaultTitleForAdminRole(employeeRole);
    const employeeId = await createLinkedEmployee({
      name: row.name,
      username: row.username,
      passwordHash: row.passwordHash,
      title,
      employeeRole,
    });
    await db
      .update(admins)
      .set({
        employeeId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(admins.id, row.id));
  }
}

export async function getAdminByUsername(
  username: string
): Promise<AdminProfile | null> {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;
  const db = await getDb();
  const row = await dbOne(
    db.select().from(admins).where(eq(admins.username, normalized))
  );
  return row ? loadAdminProfile(row.id) : null;
}

export async function resolveAdminIdForSession(input: {
  adminId: number;
  username?: string;
}): Promise<number | null> {
  if (input.adminId > 0) return input.adminId;
  if (!input.username) return null;
  const admin = await getAdminByUsername(input.username);
  return admin?.id ?? null;
}

export async function listAdmins(): Promise<AdminProfile[]> {
  const db = await getDb();
  const rows = await dbAll(
    db.select().from(admins).orderBy(desc(admins.createdAt))
  );
  return Promise.all(rows.map((row) => loadAdminProfile(row.id))).then((profiles) =>
    profiles.filter((profile): profile is AdminProfile => profile != null)
  );
}

export async function getAdmin(id: number): Promise<AdminProfile | null> {
  return loadAdminProfile(id);
}

export async function loginAdminFromDb(
  username: string,
  password: string
): Promise<Extract<SessionUser, { role: "admin" }> | null> {
  const normalized = normalizeUsername(username);
  const db = await getDb();
  const row = await dbOne(
    db
      .select()
      .from(admins)
      .where(and(eq(admins.username, normalized), eq(admins.isActive, 1)))
  );
  if (!row || !verifyPassword(password, row.passwordHash)) return null;

  const now = new Date().toISOString();
  await db
    .update(admins)
    .set({ lastLoginAt: now, updatedAt: now })
    .where(eq(admins.id, row.id));

  if (!row.employeeId) {
    await syncLinkedEmployee(row, {});
  }

  return {
    role: "admin",
    adminId: row.id,
    name: row.name,
    username: row.username,
    title: row.title ?? null,
  };
}

export async function createAdmin(payload: AdminPayload): Promise<AdminProfile> {
  const name = payload.name.trim();
  if (!name) throw new AdminCredentialError("Name is required");

  const username = normalizeUsername(payload.username);
  if (!username) throw new AdminCredentialError("Username is required");
  await assertUsernameAvailable(username);

  const password = validatePassword(payload.password, true);
  if (!password) throw new AdminCredentialError("Password is required");

  const employeeRole = inferEmployeeRoleForAdmin(
    payload.title,
    payload.employeeRole
  );
  const title = payload.title?.trim() || defaultTitleForAdminRole(employeeRole);
  const passwordHash = hashPassword(password);

  const db = await getDb();
  const now = new Date().toISOString();
  const inserted = await dbOne(
    db
      .insert(admins)
      .values({
        name,
        username,
        passwordHash,
        title,
        email: payload.email?.trim() || null,
        isActive: payload.isActive === false ? 0 : 1,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: admins.id })
  );
  if (!inserted) throw new Error("Failed to create admin");

  const adminRow = await dbOne(
    db.select().from(admins).where(eq(admins.id, inserted.id))
  );
  if (!adminRow) throw new Error("Failed to load created admin");

  const employeeId = await createLinkedEmployee({
    name,
    username,
    passwordHash,
    title,
    employeeRole,
  });
  await db
    .update(admins)
    .set({ employeeId, updatedAt: now })
    .where(eq(admins.id, inserted.id));

  await logActivity(
    "create",
    "admin",
    inserted.id,
    `Admin account created: ${name}`,
    {
      category: "employees",
      details: { username, title, employeeRole, employeeId },
    }
  );

  const created = await getAdmin(inserted.id);
  if (!created) throw new Error("Failed to load created admin");
  return created;
}

export async function updateAdmin(
  id: number,
  payload: Partial<AdminPayload>,
  options?: { actorAdminId?: number }
): Promise<AdminProfile | null> {
  const db = await getDb();
  const existingRow = await dbOne(db.select().from(admins).where(eq(admins.id, id)));
  if (!existingRow) return null;

  const updates: Partial<typeof admins.$inferInsert> = {};
  const now = new Date().toISOString();

  if (payload.name != null) {
    const name = payload.name.trim();
    if (!name) throw new AdminCredentialError("Name is required");
    updates.name = name;
  }

  if (payload.username != null) {
    const username = normalizeUsername(payload.username);
    if (!username) throw new AdminCredentialError("Username is required");
    if (username !== existingRow.username) {
      await assertUsernameAvailable(username, id);
    }
    updates.username = username;
  }

  if (payload.title !== undefined) {
    updates.title = payload.title?.trim() || null;
  }

  if (payload.email !== undefined) {
    updates.email = payload.email?.trim() || null;
  }

  if (payload.password) {
    const password = validatePassword(payload.password, false);
    if (password) updates.passwordHash = hashPassword(password);
  }

  if (payload.isActive !== undefined) {
    if (payload.isActive === false && options?.actorAdminId === id) {
      throw new AdminCredentialError("You cannot deactivate your own account");
    }
    if (payload.isActive === false) {
      const activeCount = await dbAll(
        db
          .select({ id: admins.id })
          .from(admins)
          .where(and(eq(admins.isActive, 1), ne(admins.id, id)))
      );
      if (activeCount.length === 0) {
        throw new AdminCredentialError("At least one active admin is required");
      }
    }
    updates.isActive = payload.isActive ? 1 : 0;
  }

  if (Object.keys(updates).length > 0) {
    updates.updatedAt = now;
    await db.update(admins).set(updates).where(eq(admins.id, id));
  }

  const refreshedRow = await dbOne(db.select().from(admins).where(eq(admins.id, id)));
  if (!refreshedRow) return null;

  await syncLinkedEmployee(refreshedRow, {
    name: updates.name ?? refreshedRow.name,
    username: updates.username ?? refreshedRow.username,
    passwordHash: updates.passwordHash ?? refreshedRow.passwordHash,
    title:
      updates.title !== undefined ? updates.title : refreshedRow.title ?? null,
    employeeRole: payload.employeeRole,
    isActive:
      payload.isActive !== undefined ? payload.isActive : refreshedRow.isActive === 1,
  });

  await logActivity(
    "update",
    "admin",
    id,
    `Admin account updated: ${updates.name ?? refreshedRow.name}`,
    { category: "employees", details: { actorAdminId: options?.actorAdminId ?? null } }
  );

  return getAdmin(id);
}

export async function changeAdminPassword(
  adminId: number,
  currentPassword: string,
  newPassword: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmedNew = newPassword.trim();
  if (trimmedNew.length < MIN_ADMIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters`,
    };
  }

  const db = await getDb();
  const row = await dbOne(db.select().from(admins).where(eq(admins.id, adminId)));
  if (!row || row.isActive !== 1) {
    return { ok: false, error: "Admin account not found" };
  }
  if (!verifyPassword(currentPassword, row.passwordHash)) {
    return { ok: false, error: "Current password is incorrect" };
  }

  const now = new Date().toISOString();
  const passwordHash = hashPassword(trimmedNew);
  await db
    .update(admins)
    .set({ passwordHash, updatedAt: now })
    .where(eq(admins.id, adminId));

  if (row.employeeId) {
    await db
      .update(employees)
      .set({ passwordHash, updatedAt: now })
      .where(eq(employees.id, row.employeeId));
  }

  await logActivity(
    "update",
    "admin",
    adminId,
    `${row.name}: admin password changed (self-service)`,
    { category: "employees", details: { selfService: true } }
  );

  return { ok: true };
}

export async function verifyAnyAdminPassword(pin: string): Promise<boolean> {
  const trimmed = pin.trim();
  if (!trimmed) return false;

  if (trimmed === getAdminCredentials().password) return true;

  const db = await getDb();
  const rows = await dbAll(
    db
      .select({ passwordHash: admins.passwordHash })
      .from(admins)
      .where(eq(admins.isActive, 1))
  );
  return rows.some((row) => verifyPassword(trimmed, row.passwordHash));
}
