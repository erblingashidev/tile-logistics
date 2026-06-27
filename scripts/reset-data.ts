/**
 * Wipes all operational data (orders, fleet, staff, WMS, logs, uploads).
 * Admin login (admin/admin) is unchanged — stored in env, not the database.
 *
 *   npm run reset         → Turso when TURSO_* in .env.local (same as Netlify)
 *   npm run reset:local   → local SQLite file only
 *   npm run reset:all     → both Turso and local SQLite
 */
import fs from "fs";
import path from "path";
import { sql } from "drizzle-orm";
import {
  configureScriptDatabase,
  describeScriptDatabaseTarget,
} from "./db-target";
import { getUploadRoot } from "../src/lib/config/env";
import { getDb } from "../src/lib/db";
import { dbOne } from "../src/lib/db/query";
import {
  activityLogs,
  assignments,
  deliveryProofs,
  employees,
  inventoryLines,
  inventorySessions,
  orderEmployeeAssignments,
  orderItems,
  orders,
  products,
  stockBalances,
  stockMovements,
  vehicleRoundDefaults,
  vehicles,
  warehouseLocations,
} from "../src/lib/db/schema";

configureScriptDatabase();

function describeDbTarget(): string {
  return describeScriptDatabaseTarget();
}

function clearUploads(): number {
  const uploadRoot = getUploadRoot();
  if (!fs.existsSync(uploadRoot)) return 0;
  let removed = 0;
  for (const entry of fs.readdirSync(uploadRoot, { withFileTypes: true })) {
    fs.rmSync(path.join(uploadRoot, entry.name), {
      recursive: true,
      force: true,
    });
    removed += 1;
  }
  return removed;
}

export async function resetOperationalData() {
  const db = await getDb();

  const before = await dbOne(
    db.select({ n: sql<number>`count(*)` }).from(orders)
  );

  const tables = [
    { name: "inventory_lines", table: inventoryLines },
    { name: "inventory_sessions", table: inventorySessions },
    { name: "stock_movements", table: stockMovements },
    { name: "stock_balances", table: stockBalances },
    { name: "products", table: products },
    { name: "warehouse_locations", table: warehouseLocations },
    { name: "delivery_proofs", table: deliveryProofs },
    { name: "order_employee_assignments", table: orderEmployeeAssignments },
    { name: "assignments", table: assignments },
    { name: "vehicle_round_defaults", table: vehicleRoundDefaults },
    { name: "order_items", table: orderItems },
    { name: "orders", table: orders },
    { name: "activity_logs", table: activityLogs },
    { name: "employees", table: employees },
    { name: "vehicles", table: vehicles },
  ] as const;

  for (const { name, table } of tables) {
    await db.delete(table);
    console.log(`  cleared ${name}`);
  }

  const after = await dbOne(
    db.select({ n: sql<number>`count(*)` }).from(orders)
  );
  console.log(`  orders: ${before?.n ?? 0} → ${after?.n ?? 0}`);

  return clearUploads();
}

async function main() {
  console.log(`\n=== Reset operational data → ${describeDbTarget()} ===\n`);
  const uploads = await resetOperationalData();
  console.log(`  cleared ${uploads} upload folder(s)`);
  console.log("\nDatabase is empty and ready to use.\n");
}

const entry = (process.argv[1] ?? "").replace(/\\/g, "/");
const isDirectRun =
  entry.endsWith("/reset-data.ts") ||
  entry.endsWith("/reset.cjs") ||
  entry.endsWith("reset-data.cjs");
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
