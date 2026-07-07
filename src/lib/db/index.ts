import fs from "fs";
import path from "path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import {
  assertProductionSecrets,
  getDatabasePath,
  getTursoConfig,
  isNetlify,
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
  try {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
    existing.add(column);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/duplicate column name/i.test(message)) {
      existing.add(column);
      return;
    }
    throw err;
  }
}

let deliveryProofDbPhotosEnabled = false;

export function hasDeliveryProofDbPhotos(): boolean {
  return deliveryProofDbPhotosEnabled;
}

export function setDeliveryProofDbPhotosEnabled(enabled: boolean) {
  deliveryProofDbPhotosEnabled = enabled;
}

async function ensureEmployeeNotificationsTable(client: Client) {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS employee_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE CASCADE,
      delivery_round INTEGER,
      message TEXT NOT NULL,
      read_at TEXT,
      created_at TEXT NOT NULL
    )
  `);
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_employee_notifications_employee ON employee_notifications(employee_id)"
  );
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_employee_notifications_unread ON employee_notifications(employee_id, read_at)"
  );
}

async function ensureAdminsTable(client: Client) {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      title TEXT,
      email TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT
    )
  `);
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_admins_username ON admins(username)"
  );
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_admins_active ON admins(is_active)"
  );

  const count = await client.execute("SELECT COUNT(*) AS c FROM admins");
  const rowCount = Number(count.rows[0]?.c ?? count.rows[0]?.[0] ?? 0);
  if (rowCount > 0) return;

  const { getAdminCredentials } = await import("@/lib/config/auth-env");
  const { hashPassword } = await import("@/lib/auth/password");
  const creds = getAdminCredentials();
  const now = new Date().toISOString();
  await client.execute({
    sql: `INSERT INTO admins (name, username, password_hash, title, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, 1, ?, ?)`,
    args: [
      "Admin",
      creds.username.trim().toLowerCase(),
      hashPassword(creds.password),
      "Administrator",
      now,
      now,
    ],
  });
}

async function ensureDeliveryProofPhotoColumns(client: Client) {
  let proofCols = await tableColumns(client, "delivery_proofs");
  await addColumnIfMissing(
    client,
    "delivery_proofs",
    "photo_data",
    "photo_data BLOB",
    proofCols
  );
  await addColumnIfMissing(
    client,
    "delivery_proofs",
    "photo_mime",
    "photo_mime TEXT",
    proofCols
  );
  if (!proofCols.has("photo_data")) {
    proofCols = await tableColumns(client, "delivery_proofs");
  }
  deliveryProofDbPhotosEnabled = proofCols.has("photo_data");
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

  const orderCols2 = await tableColumns(client, "orders");
  await addColumnIfMissing(
    client,
    "orders",
    "sales_employee_id",
    "sales_employee_id INTEGER REFERENCES employees(id)",
    orderCols2
  );
  await addColumnIfMissing(
    client,
    "orders",
    "sales_agent_name",
    "sales_agent_name TEXT",
    orderCols2
  );
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_orders_sales_employee ON orders(sales_employee_id)"
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
    "manager_employee_id",
    "manager_employee_id INTEGER REFERENCES employees(id)",
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
  const orderItemCols3 = await tableColumns(client, "order_items");
  await addColumnIfMissing(
    client,
    "order_items",
    "length_m",
    "length_m REAL",
    orderItemCols3
  );

  await client.execute(
    "UPDATE order_items SET product_type = 'm2' WHERE product_type = 'tile'"
  );
  await client.execute(
    "UPDATE order_items SET product_type = 'kg' WHERE product_type = 'adhesive'"
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
    CREATE TABLE IF NOT EXISTS product_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alias_key TEXT NOT NULL,
      alias_type TEXT NOT NULL,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      unit TEXT,
      ean TEXT,
      learned_from TEXT NOT NULL DEFAULT 'order',
      hit_count INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await client.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_product_aliases_key_type
      ON product_aliases(alias_key, alias_type)
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
    CREATE TABLE IF NOT EXISTS employee_warehouse_zones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      zone TEXT NOT NULL UNIQUE,
      assigned_at TEXT NOT NULL
    )
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_employee_warehouse_zones_employee
      ON employee_warehouse_zones(employee_id)
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS warehouse_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      report_type TEXT NOT NULL,
      scope TEXT NOT NULL,
      zone TEXT,
      report_week TEXT,
      category TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS warehouse_report_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL REFERENCES warehouse_reports(id) ON DELETE CASCADE,
      photo_path TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS warehouse_report_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL REFERENCES warehouse_reports(id) ON DELETE CASCADE,
      tagged_employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS warehouse_report_zones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL REFERENCES warehouse_reports(id) ON DELETE CASCADE,
      zone TEXT NOT NULL
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS warehouse_report_edit_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL REFERENCES warehouse_reports(id) ON DELETE CASCADE,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      proposed_body TEXT NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_note TEXT,
      created_at TEXT NOT NULL,
      reviewed_at TEXT
    )
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_warehouse_report_edit_requests_status
      ON warehouse_report_edit_requests(status)
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_warehouse_reports_week
      ON warehouse_reports(report_week)
  `);
  await client.execute(`
    CREATE INDEX IF NOT EXISTS idx_warehouse_reports_employee
      ON warehouse_reports(employee_id)
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
      counted_at TEXT NOT NULL,
      zone TEXT,
      sector_count_id INTEGER
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS inventory_sector_counts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES inventory_sessions(id) ON DELETE CASCADE,
      zone TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'counting',
      started_at TEXT NOT NULL,
      closed_at TEXT,
      started_by_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
      closed_by_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS inventory_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES inventory_sessions(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      location_id INTEGER NOT NULL REFERENCES warehouse_locations(id) ON DELETE CASCADE,
      zone TEXT,
      quantity_m2 REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS inventory_variance_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES inventory_sessions(id) ON DELETE CASCADE,
      previous_report_id INTEGER,
      created_at TEXT NOT NULL,
      applied_at TEXT,
      total_lines INTEGER NOT NULL DEFAULT 0,
      total_variance_m2 REAL NOT NULL DEFAULT 0,
      notes TEXT
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS inventory_variance_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL REFERENCES inventory_variance_reports(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      ean TEXT,
      location_id INTEGER REFERENCES warehouse_locations(id) ON DELETE SET NULL,
      zone TEXT,
      book_m2 REAL NOT NULL DEFAULT 0,
      counted_m2 REAL NOT NULL DEFAULT 0,
      difference_m2 REAL NOT NULL DEFAULT 0,
      previous_counted_m2 REAL,
      change_since_last_m2 REAL
    )
  `);
  const inventoryLineCols = await tableColumns(client, "inventory_lines");
  await addColumnIfMissing(
    client,
    "inventory_lines",
    "zone",
    "zone TEXT",
    inventoryLineCols
  );
  await addColumnIfMissing(
    client,
    "inventory_lines",
    "sector_count_id",
    "sector_count_id INTEGER",
    inventoryLineCols
  );
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_inventory_sector_session ON inventory_sector_counts(session_id)"
  );
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_inventory_variance_report ON inventory_variance_lines(report_id)"
  );
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_products_ean ON products(ean)"
  );

  const productCols = await tableColumns(client, "products");
  const productColumnMigrations: Array<[string, string]> = [
    ["unit", "unit TEXT NOT NULL DEFAULT 'm2'"],
    ["kg_per_pallet", "kg_per_pallet REAL"],
    ["pieces_per_pack", "pieces_per_pack INTEGER"],
    ["m2_per_pack", "m2_per_pack REAL"],
    ["kg_per_pack", "kg_per_pack REAL"],
    ["unit_weight_kg", "unit_weight_kg REAL"],
    ["pallet_footprint_length_cm", "pallet_footprint_length_cm REAL"],
    ["pallet_footprint_width_cm", "pallet_footprint_width_cm REAL"],
    ["replaces_standard_pallets", "replaces_standard_pallets REAL DEFAULT 1"],
  ];
  for (const [name, definition] of productColumnMigrations) {
    await addColumnIfMissing(client, "products", name, definition, productCols);
  }
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_products_name ON products(product_name)"
  );

  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_stock_balances_product ON stock_balances(product_id)"
  );
  await client.execute(
    "CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id)"
  );
}

/** Runtime migrations are for local/dev. On Netlify+Turso, apply schema via Turso CLI once. */
function shouldRunRuntimeMigrations(): boolean {
  if (process.env.SKIP_RUNTIME_MIGRATIONS === "true") return false;
  if (process.env.SKIP_RUNTIME_MIGRATIONS === "false") return true;
  if (isNetlify() && getTursoConfig()) return false;
  return true;
}

function shouldRunStartupBackfill(): boolean {
  if (process.env.SKIP_DB_BACKFILL === "true") return false;
  if (isNetlify() && getTursoConfig()) return false;
  return true;
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
      try {
        assertProductionSecrets();
        clientInstance = createDbClient();
        await clientInstance.execute("PRAGMA foreign_keys = ON");
        await ensureDeliveryProofPhotoColumns(clientInstance);
        await ensureEmployeeNotificationsTable(clientInstance);
        await ensureAdminsTable(clientInstance);
        if (shouldRunRuntimeMigrations()) {
          await runMigrations(clientInstance);
        }
        dbInstance = drizzle(clientInstance, { schema });
        if (shouldRunStartupBackfill()) {
          const { backfillOrderSalesOwnership } = await import(
            "@/lib/services/sales-portal"
          );
          await backfillOrderSalesOwnership();
        }
        return dbInstance;
      } catch (err) {
        initPromise = null;
        dbInstance = null;
        clientInstance = null;
        deliveryProofDbPhotosEnabled = false;
        throw err;
      }
    })();
  }

  return initPromise;
}

export { schema };
