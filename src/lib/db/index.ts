import fs from "fs";
import path from "path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import {
  assertProductionSecrets,
  getDatabasePath,
  getTursoConfig,
} from "@/lib/config/env";
import * as schema from "./schema";

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;
let clientInstance: Client | null = null;
let initPromise: Promise<ReturnType<typeof drizzle<typeof schema>>> | null =
  null;

async function tableColumns(
  client: Client,
  table: string
): Promise<Set<string>> {
  const result = await client.execute(`PRAGMA table_info(${table})`);
  const names = new Set<string>();
  for (const row of result.rows) {
    const name = row.name ?? row[1];
    if (typeof name === "string") names.add(name);
  }
  return names;
}

async function addColumnIfMissing(
  client: Client,
  table: string,
  column: string,
  definition: string,
  existing: Set<string>
) {
  if (existing.has(column)) return;
  await client.execute(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  existing.add(column);
}

async function runMigrations(client: Client) {
  const schemaPath = path.join(process.cwd(), "scripts", "turso-schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  for (const statement of statements) {
    await client.execute(statement);
  }

  const orderItemCols = await tableColumns(client, "order_items");
  await addColumnIfMissing(
    client,
    "order_items",
    "calculated_pieces",
    "calculated_pieces INTEGER",
    orderItemCols
  );
  await addColumnIfMissing(
    client,
    "order_items",
    "calculated_pallets",
    "calculated_pallets REAL",
    orderItemCols
  );
  await addColumnIfMissing(
    client,
    "order_items",
    "tile_thickness_cm",
    "tile_thickness_cm REAL",
    orderItemCols
  );

  const logCols = await tableColumns(client, "activity_logs");
  await addColumnIfMissing(
    client,
    "activity_logs",
    "message",
    "message TEXT",
    logCols
  );
  await addColumnIfMissing(
    client,
    "activity_logs",
    "category",
    "category TEXT",
    logCols
  );

  const orderCols = await tableColumns(client, "orders");
  await addColumnIfMissing(
    client,
    "orders",
    "location_id",
    "location_id TEXT",
    orderCols
  );
  await addColumnIfMissing(client, "orders", "city", "city TEXT", orderCols);
  await addColumnIfMissing(client, "orders", "lat", "lat REAL", orderCols);
  await addColumnIfMissing(client, "orders", "lng", "lng REAL", orderCols);
  await addColumnIfMissing(
    client,
    "orders",
    "region",
    "region TEXT",
    orderCols
  );
  await addColumnIfMissing(
    client,
    "orders",
    "requested_delivery_date",
    "requested_delivery_date TEXT",
    orderCols
  );
  await addColumnIfMissing(
    client,
    "orders",
    "delivery_time_preference",
    "delivery_time_preference TEXT NOT NULL DEFAULT 'flexible'",
    orderCols
  );
  await addColumnIfMissing(
    client,
    "orders",
    "priority",
    "priority TEXT NOT NULL DEFAULT 'normal'",
    orderCols
  );

  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_orders_priority ON orders(priority)"
  );
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_orders_requested_delivery ON orders(requested_delivery_date)"
  );

  const assignCols = await tableColumns(client, "assignments");
  await addColumnIfMissing(
    client,
    "assignments",
    "driver_employee_id",
    "driver_employee_id INTEGER REFERENCES employees(id)",
    assignCols
  );

  const empCols = await tableColumns(client, "employees");
  await addColumnIfMissing(
    client,
    "employees",
    "assigned_vehicle_id",
    "assigned_vehicle_id INTEGER REFERENCES vehicles(id)",
    empCols
  );
  await addColumnIfMissing(
    client,
    "employees",
    "username",
    "username TEXT",
    empCols
  );
  await addColumnIfMissing(
    client,
    "employees",
    "password_hash",
    "password_hash TEXT",
    empCols
  );
  await client.execute(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_username ON employees(username) WHERE username IS NOT NULL"
  );

  const orderItemCols2 = await tableColumns(client, "order_items");
  await addColumnIfMissing(
    client,
    "order_items",
    "product_ean",
    "product_ean TEXT",
    orderItemCols2
  );

  await client.execute(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ean TEXT UNIQUE,
      product_name TEXT,
      tile_width_cm REAL,
      tile_height_cm REAL,
      tile_thickness_cm REAL,
      pieces_per_pallet INTEGER,
      m2_per_pallet REAL,
      status TEXT NOT NULL DEFAULT 'draft',
      source TEXT NOT NULL DEFAULT 'manual',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS warehouse_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      zone TEXT,
      label TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS stock_balances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      location_id INTEGER NOT NULL REFERENCES warehouse_locations(id) ON DELETE CASCADE,
      quantity_m2 REAL NOT NULL DEFAULT 0,
      full_pallets INTEGER NOT NULL DEFAULT 0,
      loose_pieces INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      UNIQUE(product_id, location_id)
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      location_id INTEGER REFERENCES warehouse_locations(id) ON DELETE SET NULL,
      movement_type TEXT NOT NULL,
      quantity_m2 REAL NOT NULL DEFAULT 0,
      full_pallets INTEGER NOT NULL DEFAULT 0,
      loose_pieces INTEGER NOT NULL DEFAULT 0,
      reference_type TEXT,
      reference_id INTEGER,
      employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      notes TEXT,
      created_at TEXT NOT NULL
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS inventory_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      started_at TEXT NOT NULL,
      closed_at TEXT,
      started_by_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      notes TEXT
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS inventory_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES inventory_sessions(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      ean TEXT,
      quantity_m2 REAL NOT NULL DEFAULT 0,
      location_id INTEGER REFERENCES warehouse_locations(id) ON DELETE SET NULL,
      employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      notes TEXT,
      counted_at TEXT NOT NULL
    )
  `);
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_products_ean ON products(ean)"
  );
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_stock_balances_product ON stock_balances(product_id)"
  );
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id)"
  );
}

function createDbClient(): Client {
  const turso = getTursoConfig();
  if (turso) {
    return createClient({ url: turso.url, authToken: turso.authToken });
  }

  const dbPath = getDatabasePath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return createClient({ url: `file:${dbPath}` });
}

export async function getDb() {
  if (dbInstance) return dbInstance;

  if (!initPromise) {
    initPromise = (async () => {
      assertProductionSecrets();
      clientInstance = createDbClient();
      await clientInstance.execute("PRAGMA foreign_keys = ON");
      await runMigrations(clientInstance);
      dbInstance = drizzle(clientInstance, { schema });
      return dbInstance;
    })();
  }

  return initPromise;
}

export { schema };
