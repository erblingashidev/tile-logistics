import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceNumber: text("invoice_number").notNull(),
  customerName: text("customer_name").notNull(),
  location: text("location").notNull(),
  locationId: text("location_id"),
  region: text("region"),
  city: text("city"),
  lat: real("lat"),
  lng: real("lng"),
  price: real("price").notNull().default(0),
  orderDate: text("order_date").notNull(),
  requestedDeliveryDate: text("requested_delivery_date"),
  deliveryTimePreference: text("delivery_time_preference")
    .notNull()
    .default("flexible"),
  status: text("status").notNull().default("pending"),
  totalM2: real("total_m2").notNull().default(0),
  totalPieces: integer("total_pieces").notNull().default(0),
  totalPallets: integer("total_pallets").notNull().default(0),
  totalWeightKg: real("total_weight_kg").notNull().default(0),
  notes: text("notes"),
  priority: text("priority").notNull().default("normal"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const orderItems = sqliteTable("order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productType: text("product_type").notNull(),
  productName: text("product_name"),
  productEan: text("product_ean"),
  tileWidthCm: real("tile_width_cm"),
  tileHeightCm: real("tile_height_cm"),
  tileThicknessCm: real("tile_thickness_cm"),
  quantityM2: real("quantity_m2"),
  pieceCount: integer("piece_count"),
  palletCount: real("pallet_count"),
  calculatedPieces: integer("calculated_pieces"),
  calculatedPallets: real("calculated_pallets"),
  weightKg: real("weight_kg"),
});

export const vehicles = sqliteTable("vehicles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  plateNumber: text("plate_number").notNull().unique(),
  maxWeightKg: real("max_weight_kg").notNull(),
  maxPallets: integer("max_pallets").notNull(),
  status: text("status").notNull().default("available"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const assignments = sqliteTable("assignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  vehicleId: integer("vehicle_id")
    .notNull()
    .references(() => vehicles.id, { onDelete: "cascade" }),
  driverEmployeeId: integer("driver_employee_id"),
  deliveryRound: integer("delivery_round").notNull().default(1),
  assignedAt: text("assigned_at").notNull(),
});

export const employees = sqliteTable("employees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  status: text("status").notNull().default("available"),
  roles: text("roles").notNull().default("[]"),
  assignedVehicleId: integer("assigned_vehicle_id"),
  username: text("username"),
  passwordHash: text("password_hash"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const orderEmployeeAssignments = sqliteTable(
  "order_employee_assignments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    assignedAt: text("assigned_at").notNull(),
  }
);

export const activityLogs = sqliteTable("activity_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  category: text("category"),
  message: text("message"),
  details: text("details"),
  createdAt: text("created_at").notNull(),
});

export const deliveryProofs = sqliteTable("delivery_proofs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  phase: text("phase").notNull(),
  photoPath: text("photo_path"),
  notes: text("notes"),
  lat: real("lat"),
  lng: real("lng"),
  capturedAt: text("captured_at").notNull(),
  createdAt: text("created_at").notNull(),
});

/** Default picker per truck + delivery round (automation). */
export const vehicleRoundDefaults = sqliteTable("vehicle_round_defaults", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vehicleId: integer("vehicle_id")
    .notNull()
    .references(() => vehicles.id, { onDelete: "cascade" }),
  deliveryRound: integer("delivery_round").notNull().default(1),
  defaultPickerEmployeeId: integer("default_picker_employee_id").references(
    () => employees.id,
    { onDelete: "set null" }
  ),
  updatedAt: text("updated_at").notNull(),
});

/** Product catalog — learned from orders, receiving, or inventory. */
export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ean: text("ean").unique(),
  productName: text("product_name"),
  tileWidthCm: real("tile_width_cm"),
  tileHeightCm: real("tile_height_cm"),
  tileThicknessCm: real("tile_thickness_cm"),
  piecesPerPallet: integer("pieces_per_pallet"),
  m2PerPallet: real("m2_per_pallet"),
  status: text("status").notNull().default("draft"),
  source: text("source").notNull().default("manual"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const warehouseLocations = sqliteTable("warehouse_locations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  zone: text("zone"),
  label: text("label"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

/** Current stock per product + bin location. */
export const stockBalances = sqliteTable("stock_balances", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  locationId: integer("location_id")
    .notNull()
    .references(() => warehouseLocations.id, { onDelete: "cascade" }),
  quantityM2: real("quantity_m2").notNull().default(0),
  fullPallets: integer("full_pallets").notNull().default(0),
  loosePieces: integer("loose_pieces").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

export const stockMovements = sqliteTable("stock_movements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  locationId: integer("location_id").references(() => warehouseLocations.id, {
    onDelete: "set null",
  }),
  movementType: text("movement_type").notNull(),
  quantityM2: real("quantity_m2").notNull().default(0),
  fullPallets: integer("full_pallets").notNull().default(0),
  loosePieces: integer("loose_pieces").notNull().default(0),
  referenceType: text("reference_type"),
  referenceId: integer("reference_id"),
  employeeId: integer("employee_id").references(() => employees.id, {
    onDelete: "set null",
  }),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const inventorySessions = sqliteTable("inventory_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  status: text("status").notNull().default("open"),
  startedAt: text("started_at").notNull(),
  closedAt: text("closed_at"),
  startedByEmployeeId: integer("started_by_employee_id").references(
    () => employees.id,
    { onDelete: "set null" }
  ),
  notes: text("notes"),
});

export const inventoryLines = sqliteTable("inventory_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id")
    .notNull()
    .references(() => inventorySessions.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => products.id, {
    onDelete: "set null",
  }),
  ean: text("ean"),
  quantityM2: real("quantity_m2").notNull().default(0),
  locationId: integer("location_id").references(() => warehouseLocations.id, {
    onDelete: "set null",
  }),
  employeeId: integer("employee_id").references(() => employees.id, {
    onDelete: "set null",
  }),
  notes: text("notes"),
  countedAt: text("counted_at").notNull(),
});
