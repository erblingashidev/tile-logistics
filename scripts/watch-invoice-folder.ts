#!/usr/bin/env node
/**
 * Watches INVOICE_WATCH_DIR from .env.local and queues Excel invoices.
 * Run on the PC where Pro-Data saves files (Windows HP).
 *
 *   npm run watch:invoices:turso
 */
import fs from "fs";
import {
  configureScriptDatabase,
  describeScriptDatabaseTarget,
} from "./db-target";
import { scanInvoiceWatchRoot } from "../src/lib/services/invoice-import-queue";
import { getInvoiceWatchRoot } from "../src/lib/services/app-settings";
import { getDb } from "../src/lib/db";

const POLL_MS = Number(process.env.INVOICE_WATCH_POLL_MS ?? 8000);

function applyCliDatabaseTarget() {
  if (process.argv.includes("--turso")) {
    process.env.DB_TARGET = "turso";
  } else if (process.argv.includes("--local")) {
    process.env.DB_TARGET = "local";
  }
}

async function runScan() {
  const root = await getInvoiceWatchRoot();
  if (!root) {
    console.log(
      `[${new Date().toLocaleTimeString()}] No folder configured — add INVOICE_WATCH_DIR to .env.local`
    );
    return;
  }
  if (!fs.existsSync(root)) {
    console.log(
      `[${new Date().toLocaleTimeString()}] Folder not found: ${root}`
    );
    return;
  }

  const result = await scanInvoiceWatchRoot(root);
  const parts = [
    `scanned ${result.scanned}`,
    `queued ${result.queued}`,
    `skipped ${result.skipped}`,
  ];
  if (result.errors.length > 0) {
    parts.push(`errors ${result.errors.length}`);
  }
  console.log(
    `[${new Date().toLocaleTimeString()}] ${parts.join(", ")} — ${root}`
  );
  if (result.dateFolders?.length) {
    console.log(`  date folders: ${result.dateFolders.join(", ")}`);
  }
  if (result.hint) {
    console.log(`  → ${result.hint}`);
  }
  if (result.scanned > 0 && result.skipped === result.scanned) {
    console.log("  → All files already in import queue (check Orders → Import queue)");
  }
  for (const err of result.errors.slice(0, 5)) {
    console.log(`  · ${err}`);
  }
}

async function main() {
  applyCliDatabaseTarget();
  configureScriptDatabase();
  await getDb();

  console.log("Invoice folder watcher");
  console.log(`Database: ${describeScriptDatabaseTarget()}`);
  console.log(`Poll every ${POLL_MS / 1000}s — date subfolders like 09.07.2026`);
  const configuredRoot = await getInvoiceWatchRoot();
  if (configuredRoot) {
    console.log(`Watching: ${configuredRoot}`);
  } else {
    console.log(
      "No folder yet — add INVOICE_WATCH_DIR to .env.local (see docs/HP-SETUP.md)"
    );
  }
  console.log("Press Ctrl+C to stop.\n");

  await runScan();
  setInterval(() => {
    void runScan().catch((err) => {
      console.error("Scan failed:", err instanceof Error ? err.message : err);
    });
  }, POLL_MS);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
