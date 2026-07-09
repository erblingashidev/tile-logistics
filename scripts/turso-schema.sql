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

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_invoice_number_unique ON orders(invoice_number);

CREATE TABLE IF NOT EXISTS order_delivery_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id_a INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_id_b INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  note TEXT,
  created_at TEXT NOT NULL,
  CHECK (order_id_a < order_id_b)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_delivery_links_pair ON order_delivery_links(order_id_a, order_id_b);

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

CREATE TABLE IF NOT EXISTS vehicle_maintenance_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  performed_at TEXT NOT NULL,
  next_due_at TEXT,
  work_done TEXT NOT NULL,
  cost REAL NOT NULL DEFAULT 0,
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
  title TEXT,
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
  photo_data BLOB,
  photo_mime TEXT,
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
);

CREATE TABLE IF NOT EXISTS warehouse_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  zone TEXT,
  label TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS employee_warehouse_zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  zone TEXT NOT NULL UNIQUE,
  assigned_at TEXT NOT NULL
);

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
);

CREATE TABLE IF NOT EXISTS warehouse_report_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES warehouse_reports(id) ON DELETE CASCADE,
  photo_path TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS warehouse_report_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES warehouse_reports(id) ON DELETE CASCADE,
  tagged_employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS warehouse_report_zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES warehouse_reports(id) ON DELETE CASCADE,
  zone TEXT NOT NULL
);

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
);

CREATE TABLE IF NOT EXISTS stock_balances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES warehouse_locations(id) ON DELETE CASCADE,
  quantity_m2 REAL NOT NULL DEFAULT 0,
  full_pallets INTEGER NOT NULL DEFAULT 0,
  loose_pieces INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE(product_id, location_id)
);

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
);

CREATE TABLE IF NOT EXISTS inventory_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  started_at TEXT NOT NULL,
  closed_at TEXT,
  started_by_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  notes TEXT
);

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
);

CREATE TABLE IF NOT EXISTS inventory_sector_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES inventory_sessions(id) ON DELETE CASCADE,
  zone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'counting',
  started_at TEXT NOT NULL,
  closed_at TEXT,
  started_by_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  closed_by_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS inventory_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES inventory_sessions(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES warehouse_locations(id) ON DELETE CASCADE,
  zone TEXT,
  quantity_m2 REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_variance_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES inventory_sessions(id) ON DELETE CASCADE,
  previous_report_id INTEGER,
  created_at TEXT NOT NULL,
  applied_at TEXT,
  total_lines INTEGER NOT NULL DEFAULT 0,
  total_variance_m2 REAL NOT NULL DEFAULT 0,
  notes TEXT
);

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
);

CREATE INDEX IF NOT EXISTS idx_inventory_sector_session ON inventory_sector_counts(session_id);
CREATE INDEX IF NOT EXISTS idx_inventory_variance_report ON inventory_variance_lines(report_id);

CREATE INDEX IF NOT EXISTS idx_products_ean ON products(ean);
CREATE INDEX IF NOT EXISTS idx_employee_warehouse_zones_employee
  ON employee_warehouse_zones(employee_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_reports_week
  ON warehouse_reports(report_week);
CREATE INDEX IF NOT EXISTS idx_warehouse_reports_employee
  ON warehouse_reports(employee_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_report_edit_requests_status
  ON warehouse_report_edit_requests(status);

CREATE TABLE IF NOT EXISTS invoice_import_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'pending',
  source_file_name TEXT NOT NULL,
  source_file_path TEXT,
  source_folder_date TEXT,
  file_fingerprint TEXT NOT NULL,
  parsed_json TEXT NOT NULL,
  duplicate_order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  error_message TEXT,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  admin_note TEXT,
  submitted_at TEXT NOT NULL,
  reviewed_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_import_queue_fingerprint
  ON invoice_import_queue(file_fingerprint);
CREATE INDEX IF NOT EXISTS idx_invoice_import_queue_status
  ON invoice_import_queue(status);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stock_balances_product ON stock_balances(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_maintenance_vehicle
  ON vehicle_maintenance_records(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_maintenance_next_due
  ON vehicle_maintenance_records(next_due_at);

CREATE TABLE IF NOT EXISTS employee_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE CASCADE,
  delivery_round INTEGER,
  message TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_notifications_employee
  ON employee_notifications(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_notifications_unread
  ON employee_notifications(employee_id, read_at);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  title TEXT,
  email TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  employee_id INTEGER REFERENCES employees(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_admins_username ON admins(username);
CREATE INDEX IF NOT EXISTS idx_admins_active ON admins(is_active);
