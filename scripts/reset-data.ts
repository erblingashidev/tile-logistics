/**
 * Wipes operational data for a clean start.
 * Keeps: admins, employees, vehicles (+ maintenance / round defaults / zone links).
 * Clears: orders, WMS, inventory, reports, import queue, activity logs, app settings, uploads.
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
  appSettings,
  assignments,
  deliveryProofs,
  employeeNotifications,
  inventoryLines,
  inventorySectorCounts,
  inventorySessions,
  inventorySnapshots,
  inventoryVarianceLines,
  inventoryVarianceReports,
  invoiceImportQueue,
  orderDeliveryLinks,
  orderEmployeeAssignments,
  orderItems,
  orders,
  productAliases,
  products,
  stockBalances,
  stockMovements,
  warehouseLocations,
  warehouseReportEditRequests,
  warehouseReportPhotos,
  warehouseReports,
  warehouseReportTags,
  warehouseReportZones,
  admins,
  employees,
  vehicles,
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

/** Tables wiped in FK-safe order. Users + vehicles are intentionally omitted. */
const WIPE_TABLES = [
  { name: "inventory_variance_lines", table: inventoryVarianceLines },
  { name: "inventory_variance_reports", table: inventoryVarianceReports },
  { name: "inventory_snapshots", table: inventorySnapshots },
  { name: "inventory_lines", table: inventoryLines },
  { name: "inventory_sector_counts", table: inventorySectorCounts },
  { name: "inventory_sessions", table: inventorySessions },
  { name: "stock_movements", table: stockMovements },
  { name: "stock_balances", table: stockBalances },
  { name: "product_aliases", table: productAliases },
  { name: "products", table: products },
  { name: "warehouse_report_edit_requests", table: warehouseReportEditRequests },
  { name: "warehouse_report_photos", table: warehouseReportPhotos },
  { name: "warehouse_report_tags", table: warehouseReportTags },
  { name: "warehouse_report_zones", table: warehouseReportZones },
  { name: "warehouse_reports", table: warehouseReports },
  { name: "delivery_proofs", table: deliveryProofs },
  { name: "order_employee_assignments", table: orderEmployeeAssignments },
  { name: "assignments", table: assignments },
  { name: "order_delivery_links", table: orderDeliveryLinks },
  { name: "order_items", table: orderItems },
  { name: "invoice_import_queue", table: invoiceImportQueue },
  { name: "orders", table: orders },
  { name: "warehouse_locations", table: warehouseLocations },
  { name: "employee_notifications", table: employeeNotifications },
  { name: "activity_logs", table: activityLogs },
  { name: "app_settings", table: appSettings },
] as const;

export async function resetOperationalData() {
  const db = await getDb();

  const beforeOrders = await dbOne(
    db.select({ n: sql<number>`count(*)` }).from(orders)
  );
  const keptAdmins = await dbOne(
    db.select({ n: sql<number>`count(*)` }).from(admins)
  );
  const keptEmployees = await dbOne(
    db.select({ n: sql<number>`count(*)` }).from(employees)
  );
  const keptVehicles = await dbOne(
    db.select({ n: sql<number>`count(*)` }).from(vehicles)
  );

  console.log(
    `  keeping ${keptAdmins?.n ?? 0} admin(s), ${keptEmployees?.n ?? 0} employee(s), ${keptVehicles?.n ?? 0} vehicle(s)`
  );

  for (const { name, table } of WIPE_TABLES) {
    try {
      await db.delete(table);
      console.log(`  cleared ${name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Older DBs may lack newer tables — skip those.
      if (/no such table/i.test(msg)) {
        console.log(`  skip ${name} (missing)`);
        continue;
      }
      throw err;
    }
  }

  const afterOrders = await dbOne(
    db.select({ n: sql<number>`count(*)` }).from(orders)
  );
  const afterLogs = await dbOne(
    db.select({ n: sql<number>`count(*)` }).from(activityLogs)
  );
  console.log(
    `  orders: ${beforeOrders?.n ?? 0} → ${afterOrders?.n ?? 0}; activity_logs → ${afterLogs?.n ?? 0}`
  );

  return clearUploads();
}

async function main() {
  console.log(`\n=== Reset operational data → ${describeDbTarget()} ===`);
  console.log("    (keeps admins, employees, vehicles)\n");
  const uploads = await resetOperationalData();
  console.log(`  cleared ${uploads} upload folder(s)`);
  console.log("\nDatabase is clear — users and vehicles kept.\n");
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
