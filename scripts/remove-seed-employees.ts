/**
 * Remove demo/seed staff (from npm run seed / seed:reports) and keep real employees.
 *
 *   npm run remove-seed-employees          → Turso (same as dev)
 *   npm run remove-seed-employees:local    → local SQLite
 */
import { eq, inArray, sql } from "drizzle-orm";
import {
  configureScriptDatabase,
  describeScriptDatabaseTarget,
} from "./db-target";
import { getDb } from "../src/lib/db";
import { dbAll } from "../src/lib/db/query";
import {
  admins,
  assignments,
  employees,
  orders,
  vehicleRoundDefaults,
} from "../src/lib/db/schema";
import { deleteEmployee } from "../src/lib/services/employees";

/** Usernames created by scripts/seed.ts and scripts/seed-report-orders.ts */
export const SEED_EMPLOYEE_USERNAMES = [
  "salesadmin",
  "agjenti",
  "showroom",
  "depoadmin",
  "picker",
  "picker2",
  "helper",
  "naim",
  "pastrues",
  "driver",
  "driver1",
] as const;

configureScriptDatabase();

async function main() {
  console.log(
    `\n=== Remove seed employees → ${describeScriptDatabaseTarget()} ===\n`
  );

  const db = await getDb();
  const seedRows = await dbAll(
    db
      .select({
        id: employees.id,
        name: employees.name,
        username: employees.username,
      })
      .from(employees)
      .where(inArray(employees.username, [...SEED_EMPLOYEE_USERNAMES]))
  );

  if (seedRows.length === 0) {
    console.log("No seed employees found — nothing to remove.\n");
    return;
  }

  console.log(`Found ${seedRows.length} seed employee(s):`);
  for (const row of seedRows) {
    console.log(`  · ${row.name} (@${row.username}, id ${row.id})`);
  }

  const seedIds = seedRows.map((r) => r.id);

  // Clear non-cascading FKs before delete.
  await db
    .update(assignments)
    .set({ driverEmployeeId: null })
    .where(inArray(assignments.driverEmployeeId, seedIds));

  await db
    .update(vehicleRoundDefaults)
    .set({ defaultPickerEmployeeId: null })
    .where(inArray(vehicleRoundDefaults.defaultPickerEmployeeId, seedIds));

  await db
    .update(employees)
    .set({ managerEmployeeId: null })
    .where(inArray(employees.managerEmployeeId, seedIds));

  await db
    .update(orders)
    .set({ salesEmployeeId: null })
    .where(inArray(orders.salesEmployeeId, seedIds));

  await db
    .update(admins)
    .set({ employeeId: null })
    .where(inArray(admins.employeeId, seedIds));

  let removed = 0;
  for (const row of seedRows) {
    const ok = await deleteEmployee(row.id);
    if (ok) {
      removed++;
      console.log(`  ✓ Removed ${row.name}`);
    } else {
      console.log(`  ✗ Could not remove ${row.name} (id ${row.id})`);
    }
  }

  const remaining = await dbAll(
    db.select({ n: sql<number>`count(*)` }).from(employees)
  );
  console.log(
    `\nDone — removed ${removed}/${seedRows.length}. ${remaining[0]?.n ?? 0} employees remain.\n`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
