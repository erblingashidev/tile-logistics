#!/usr/bin/env node
/**
 * Re-parse pending/rejected import queue rows from their source Excel files.
 * Run on the HP PC where invoice files live (same as watch:invoices:turso).
 *
 *   npm run refresh:import-queue:turso
 */
import { configureScriptDatabase, describeScriptDatabaseTarget } from "./db-target";
import { getDb } from "../src/lib/db";
import { refreshPendingImportQueueSnapshots } from "../src/lib/services/invoice-import-queue";

function applyCliDatabaseTarget() {
  if (process.argv.includes("--turso")) {
    process.env.DB_TARGET = "turso";
  } else if (process.argv.includes("--local")) {
    process.env.DB_TARGET = "local";
  }
}

async function main() {
  applyCliDatabaseTarget();
  configureScriptDatabase();
  await getDb();

  console.log(`Database: ${describeScriptDatabaseTarget()}`);
  const refreshed = await refreshPendingImportQueueSnapshots();
  console.log(
    refreshed > 0
      ? `Refreshed ${refreshed} queued import(s) from Excel files.`
      : "No queued imports refreshed (none pending, or source files not found)."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
