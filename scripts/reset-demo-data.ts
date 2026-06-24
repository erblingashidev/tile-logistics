/**
 * Wipes all operational data (orders, fleet, staff, logs, proof uploads).
 * Admin login (admin/admin) is unchanged — it is not stored in the database.
 *
 * Run: npm run reset-data
 */
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "tile-logistics.db");
const UPLOAD_ROOT = path.join(process.cwd(), "data", "uploads");

function removeUploads() {
  if (!fs.existsSync(UPLOAD_ROOT)) return 0;
  let removed = 0;
  for (const entry of fs.readdirSync(UPLOAD_ROOT, { withFileTypes: true })) {
    const full = path.join(UPLOAD_ROOT, entry.name);
    if (entry.isDirectory()) {
      fs.rmSync(full, { recursive: true, force: true });
      removed += 1;
    } else {
      fs.unlinkSync(full);
      removed += 1;
    }
  }
  return removed;
}

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.log("No database found — nothing to reset.");
    return;
  }

  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = OFF");

  const tables = [
    "delivery_proofs",
    "order_employee_assignments",
    "assignments",
    "order_items",
    "orders",
    "vehicle_round_defaults",
    "activity_logs",
    "employees",
    "vehicles",
  ] as const;

  console.log("\n=== Resetting operational data ===\n");

  for (const table of tables) {
    const before = (
      db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }
    ).n;
    db.prepare(`DELETE FROM ${table}`).run();
    console.log(`  ${table}: removed ${before} row(s)`);
  }

  db.prepare("DELETE FROM sqlite_sequence WHERE name IN (?, ?, ?, ?)").run(
    "orders",
    "vehicles",
    "employees",
    "activity_logs"
  );

  db.pragma("foreign_keys = ON");
  db.exec("VACUUM");
  db.close();

  const uploadDirs = removeUploads();
  console.log(`  uploads: cleared ${uploadDirs} entr(y/ies)`);
  console.log("\nDone. Database is empty — add real vehicles, staff, and orders.\n");
}

main();
