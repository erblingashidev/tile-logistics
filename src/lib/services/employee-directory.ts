import { getControlPlaneDb, getLibsqlClient } from "@/lib/db";

export type EmployeeDirectoryEntry = {
  username: string;
  organizationId: number;
  employeeId: number;
};

export async function lookupDirectoryByEmployeeId(
  employeeId: number
): Promise<EmployeeDirectoryEntry | null> {
  await getControlPlaneDb();
  const client = await getLibsqlClient();
  const result = await client.execute({
    sql: `SELECT username, organization_id, employee_id
          FROM employee_directory WHERE employee_id = ?`,
    args: [employeeId],
  });
  const hit = result.rows[0];
  if (!hit) return null;
  const organizationId = Number(hit.organization_id ?? hit[1]);
  const id = Number(hit.employee_id ?? hit[2]);
  const username = String(hit.username ?? hit[0] ?? "")
    .trim()
    .toLowerCase();
  if (
    !username ||
    !Number.isFinite(organizationId) ||
    !Number.isFinite(id)
  ) {
    return null;
  }
  return { username, organizationId, employeeId: id };
}

export async function lookupEmployeeDirectory(
  username: string
): Promise<EmployeeDirectoryEntry | null> {
  await getControlPlaneDb();
  const client = await getLibsqlClient();
  const normalized = username.trim().toLowerCase();
  const result = await client.execute({
    sql: `SELECT username, organization_id, employee_id
          FROM employee_directory WHERE username = ?`,
    args: [normalized],
  });
  const hit = result.rows[0];
  if (!hit) return null;
  const organizationId = Number(hit.organization_id ?? hit[1]);
  const employeeId = Number(hit.employee_id ?? hit[2]);
  if (!Number.isFinite(organizationId) || !Number.isFinite(employeeId)) {
    return null;
  }
  return {
    username: normalized,
    organizationId,
    employeeId,
  };
}

export async function upsertEmployeeDirectory(entry: EmployeeDirectoryEntry) {
  await getControlPlaneDb();
  const client = await getLibsqlClient();
  const now = new Date().toISOString();
  await client.execute({
    sql: `INSERT INTO employee_directory (username, organization_id, employee_id, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(username) DO UPDATE SET
            organization_id = excluded.organization_id,
            employee_id = excluded.employee_id,
            updated_at = excluded.updated_at`,
    args: [
      entry.username.trim().toLowerCase(),
      entry.organizationId,
      entry.employeeId,
      now,
    ],
  });
}

export async function removeEmployeeDirectory(username: string) {
  await getControlPlaneDb();
  const client = await getLibsqlClient();
  await client.execute({
    sql: `DELETE FROM employee_directory WHERE username = ?`,
    args: [username.trim().toLowerCase()],
  });
}

/** Align employees.organization_id with login directory (fixes cross-company leaks on shared DB). */
export async function repairEmployeeOrganizationsFromDirectory() {
  await getControlPlaneDb();
  const client = await getLibsqlClient();
  await client.execute(`
    UPDATE employees
    SET organization_id = (
      SELECT d.organization_id
      FROM employee_directory d
      WHERE d.username = employees.username
    )
    WHERE employees.username IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM employee_directory d
        WHERE d.username = employees.username
          AND d.organization_id != employees.organization_id
      )
  `);
}

/** Employee ids whose portal login is registered to another company. */
export async function employeeIdsRegisteredToOtherOrganizations(
  organizationId: number
): Promise<Set<number>> {
  await getControlPlaneDb();
  const client = await getLibsqlClient();
  const result = await client.execute({
    sql: `SELECT employee_id FROM employee_directory WHERE organization_id != ?`,
    args: [organizationId],
  });
  const out = new Set<number>();
  for (const row of result.rows) {
    const id = Number(row.employee_id ?? row[0]);
    if (Number.isFinite(id)) out.add(id);
  }
  return out;
}

/** Drop shared-DB rows that duplicate another company's portal login. */
export async function pruneControlPlaneEmployeeShadows(
  organizationId: number
): Promise<void> {
  await getControlPlaneDb();
  const client = await getLibsqlClient();
  await client.execute({
    sql: `DELETE FROM employees
          WHERE organization_id = ?
            AND username IS NOT NULL
            AND username IN (
              SELECT username FROM employee_directory WHERE organization_id != ?
            )`,
    args: [organizationId, organizationId],
  });
  await client.execute({
    sql: `DELETE FROM employees
          WHERE organization_id = ?
            AND id IN (
              SELECT employee_id FROM employee_directory WHERE organization_id != ?
            )`,
    args: [organizationId, organizationId],
  });
}

export async function usernamesRegisteredToOtherOrganizations(
  organizationId: number
): Promise<Set<string>> {
  await getControlPlaneDb();
  const client = await getLibsqlClient();
  const result = await client.execute({
    sql: `SELECT username FROM employee_directory WHERE organization_id != ?`,
    args: [organizationId],
  });
  const out = new Set<string>();
  for (const row of result.rows) {
    const name = row.username ?? row[0];
    if (typeof name === "string" && name.trim()) {
      out.add(name.trim().toLowerCase());
    }
  }
  return out;
}
