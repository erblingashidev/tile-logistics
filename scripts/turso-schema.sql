-- Tile Logistics schema for Turso / libSQL
-- Apply: turso db shell YOUR_DB < scripts/turso-schema.sql

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  location TEXT NOT NULL,
  location_id TEXT,
  city TEXT,
  lat REAL,
  lng REAL,
  price REAL NOT NULL DEFAULT 0,
  order_date TEXT NOT NULL,
  requested_delivery_date TEXT,
  delivery_time_preference TEXT NOT NULL DEFAULT 'flexible',
  status TEXT NOT NULL DEFAULT 'pending',
  total_m2 REAL NOT NULL DEFAULT 0,
  total_pieces INTEGER NOT NULL DEFAULT 0,
  total_pallets INTEGER NOT NULL DEFAULT 0,
  total_weight_kg REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_type TEXT NOT NULL,
  product_name TEXT,
  tile_width_cm REAL,
  tile_height_cm REAL,
  tile_thickness_cm REAL,
  quantity_m2 REAL,
  piece_count INTEGER,
  pallet_count REAL,
  calculated_pieces INTEGER,
  calculated_pallets REAL,
  weight_kg REAL
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  plate_number TEXT NOT NULL UNIQUE,
  max_weight_kg REAL NOT NULL,
  max_pallets INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  driver_employee_id INTEGER,
  delivery_round INTEGER NOT NULL DEFAULT 1,
  assigned_at TEXT NOT NULL,
  UNIQUE(order_id, delivery_round)
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  category TEXT,
  message TEXT,
  details TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  roles TEXT NOT NULL DEFAULT '[]',
  assigned_vehicle_id INTEGER,
  username TEXT,
  password_hash TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_username ON employees(username) WHERE username IS NOT NULL;

CREATE TABLE IF NOT EXISTS order_employee_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  UNIQUE(order_id, role)
);

CREATE TABLE IF NOT EXISTS delivery_proofs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  photo_path TEXT,
  notes TEXT,
  lat REAL,
  lng REAL,
  captured_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicle_round_defaults (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  delivery_round INTEGER NOT NULL DEFAULT 1,
  default_picker_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(vehicle_id, delivery_round)
);

CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_orders_location ON orders(location);
CREATE INDEX IF NOT EXISTS idx_orders_requested_delivery ON orders(requested_delivery_date);
CREATE INDEX IF NOT EXISTS idx_logs_created ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_assignments_vehicle ON assignments(vehicle_id, delivery_round);
CREATE INDEX IF NOT EXISTS idx_order_staff_order ON order_employee_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_staff_employee ON order_employee_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_delivery_proofs_order ON delivery_proofs(order_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_round_defaults_vehicle ON vehicle_round_defaults(vehicle_id, delivery_round);
