/**
 * Copy warehouse_locations from local SQLite into Turso (production).
 *
 *   npm run sync:locations
 */
import Database from "better-sqlite3";
import { createClient } from "@libsql/client";
import path from "path";
import { loadEnvLocal } from "./load-env-local";
import { getDatabasePath } from "../src/lib/config/env";

interface LocalLocation {
  code: string;
  zone: string | null;
  label: string | null;
  notes: string | null;
  created_at: string;
}

async function main() {
  loadEnvLocal();

  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  const tursoToken = process.env.TURSO_AUTH_TOKEN?.trim();
  if (!tursoUrl || !tursoToken) {
    console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in .env.local");
    process.exit(1);
  }

  const localPath = getDatabasePath();
  const sqlite = new Database(localPath, { readonly: true });
  const rows = sqlite
    .prepare(
      `SELECT code, zone, label, notes, created_at
       FROM warehouse_locations
       ORDER BY zone, code`
    )
    .all() as LocalLocation[];

  if (rows.length === 0) {
    console.log("No warehouse locations in local database.");
    process.exit(0);
  }

  const turso = createClient({ url: tursoUrl, authToken: tursoToken });

  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    const code = row.code.trim().toUpperCase();
    const existing = await turso.execute({
      sql: "SELECT id FROM warehouse_locations WHERE code = ?",
      args: [code],
    });

    if (existing.rows.length > 0) {
      await turso.execute({
        sql: `UPDATE warehouse_locations
              SET zone = ?, label = ?, notes = ?
              WHERE code = ?`,
        args: [row.zone, row.label, row.notes, code],
      });
      updated++;
    } else {
      await turso.execute({
        sql: `INSERT INTO warehouse_locations (code, zone, label, notes, created_at)
              VALUES (?, ?, ?, ?, ?)`,
        args: [code, row.zone, row.label, row.notes, row.created_at],
      });
      inserted++;
    }
  }

  const remoteCount = await turso.execute(
    "SELECT COUNT(*) AS c FROM warehouse_locations"
  );
  const total = Number(remoteCount.rows[0]?.c ?? 0);

  console.log(`Local locations: ${rows.length}`);
  console.log(`Turso: inserted ${inserted}, updated ${updated}, total now ${total}`);
  sqlite.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
