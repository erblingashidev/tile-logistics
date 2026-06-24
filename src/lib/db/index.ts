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
