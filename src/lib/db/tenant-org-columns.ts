import type { Client } from "@libsql/client";
import { LEGACY_AGIMI_ORGANIZATION_ID } from "@/lib/organizations/constants";

/** Tables that need organization_id for shared-database multi-tenancy (spec company_id). */
export const TENANT_ORG_COLUMN_TABLES = [
  "warehouse_locations",
  "stock_balances",
  "stock_movements",
  "inventory_sessions",
  "warehouse_reports",
  "customer_returns",
  "employee_notifications",
] as const;

async function tableColumns(client: Client, table: string): Promise<Set<string>> {
  const result = await client.execute(`PRAGMA table_info(${table})`);
  const cols = new Set<string>();
  for (const row of result.rows) {
    const name = row.name ?? row[1];
    if (typeof name === "string") cols.add(name);
  }
  return cols;
}

async function addColumnIfMissing(
  client: Client,
  table: string,
  column: string,
  definition: string,
  existing: Set<string>
) {
  if (existing.has(column)) return;
  await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  existing.add(column);
}

/**
 * Add organization_id to WMS / warehouse tables and backfill legacy rows to org #1.
 * Safe to run on every bootstrap (idempotent).
 */
export async function ensureTenantOrganizationColumns(client: Client) {
  const orgId = LEGACY_AGIMI_ORGANIZATION_ID;

  for (const table of TENANT_ORG_COLUMN_TABLES) {
    const cols = await tableColumns(client, table);
    if (!cols.size) continue;

    await addColumnIfMissing(
      client,
      table,
      "organization_id",
      "INTEGER DEFAULT 1",
      cols
    );

    await client.execute({
      sql: `UPDATE ${table}
            SET organization_id = ?
            WHERE organization_id IS NULL OR organization_id <= 0`,
      args: [orgId],
    });

    await client.execute(
      `CREATE INDEX IF NOT EXISTS idx_${table}_organization_id ON ${table}(organization_id)`
    );
  }

  await client.execute(
    `CREATE INDEX IF NOT EXISTS idx_warehouse_locations_org_code ON warehouse_locations(organization_id, code)`
  );
  await client.execute(
    `CREATE INDEX IF NOT EXISTS idx_stock_balances_org_product ON stock_balances(organization_id, product_id)`
  );
  await client.execute(
    `CREATE INDEX IF NOT EXISTS idx_inventory_sessions_org_status ON inventory_sessions(organization_id, status)`
  );
}
