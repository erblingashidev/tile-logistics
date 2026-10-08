import { getControlPlaneDb, getLibsqlClient } from "@/lib/db";

export type EmployeeDirectoryEntry = {
  username: string;
  organizationId: number;
  employeeId: number;
};

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
