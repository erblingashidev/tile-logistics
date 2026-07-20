#!/usr/bin/env node
/**
 * Apply / repair database schema (safe to run multiple times).
 * Uses .env.local — same Turso database as the live site.
 *
 *   npm run turso:apply-schema        → Turso (HP / Mac)
 *   npm run turso:apply-schema:local  → local SQLite only
 */
import { createClient } from "@libsql/client";
import {
  configureScriptDatabase,
  describeScriptDatabaseTarget,
} from "./db-target";
import { getDb } from "../src/lib/db";
import { getTursoConfig, getDatabasePath } from "../src/lib/config/env";

const REQUIRED_TABLES = [
  "delivery_proofs",
  "app_settings",
  "invoice_import_queue",
  "orders",
  "employees",
  "admins",
  "products",
  "warehouse_locations",
  "stock_balances",
  "stock_movements",
];

function applyCliDatabaseTarget() {
  if (process.argv.includes("--turso")) {
    process.env.DB_TARGET = "turso";
  } else if (process.argv.includes("--local")) {
    process.env.DB_TARGET = "local";
  }
}

async function verifyTables(): Promise<boolean> {
  const turso = getTursoConfig();
  const client = turso
    ? createClient({ url: turso.url, authToken: turso.authToken })
    : createClient({ url: `file:${getDatabasePath()}` });

  let ok = true;
  for (const table of REQUIRED_TABLES) {
    const result = await client.execute({
      sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      args: [table],
    });
    const found = result.rows.length > 0;
    console.log(found ? `  ✓ ${table}` : `  ✗ ${table} — still missing`);
    if (!found) ok = false;
  }
  return ok;
}

async function main() {
  applyCliDatabaseTarget();
  process.env.SKIP_RUNTIME_MIGRATIONS = "false";
  configureScriptDatabase();

  console.log("Applying database schema…");
  console.log(`Target: ${describeScriptDatabaseTarget()}\n`);

  await getDb();

  console.log("\nChecking required tables:");
  const ok = await verifyTables();

  if (ok) {
    console.log("\nDone — schema is ready. Start the watcher:");
    console.log("  npm run watch:invoices:turso");
    return;
  }

  console.error(
    "\nSome tables are still missing. On Mac with Turso CLI installed, also run:"
  );
  console.error("  ./scripts/setup-turso.sh");
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
