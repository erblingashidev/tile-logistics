import { sqliteTable, text, integer, real, blob, uniqueIndex } from "drizzle-orm/sqlite-core";

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  invoiceNumber: text("invoice_number").notNull().unique(),
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
  customerHasForklift: integer("customer_has_forklift").notNull().default(0),
  /** Manual dispatch hint: prefer this truck when planning routes. */
  preferredTruckId: integer("preferred_truck_id").references(() => vehicles.id, {
    onDelete: "set null",
  }),
  salesEmployeeId: integer("sales_employee_id").references(() => employees.id, {
    onDelete: "set null",
  }),
  salesAgentName: text("sales_agent_name"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Pairwise link: these invoices should go on the same truck (soft suggestion). */
export const orderDeliveryLinks = sqliteTable(
  "order_delivery_links",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderIdA: integer("order_id_a")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    orderIdB: integer("order_id_b")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    note: text("note"),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    pairIdx: uniqueIndex("idx_order_delivery_links_pair").on(
      table.orderIdA,
      table.orderIdB
    ),
  })
);

export const orderItems = sqliteTable("order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  unit: text("product_type").notNull(),
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
  lengthM: real("length_m"),
});

export const vehicles = sqliteTable("vehicles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  plateNumber: text("plate_number").notNull().unique(),
  maxWeightKg: real("max_weight_kg").notNull(),
  maxPallets: integer("max_pallets").notNull(),
  status: text("status").notNull().default("available"),
  /** delivery = warehouse trucks; sales = company cars for sales staff */
  category: text("category").notNull().default("delivery"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const vehicleMaintenanceRecords = sqliteTable("vehicle_maintenance_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  vehicleId: integer("vehicle_id")
    .notNull()
    .references(() => vehicles.id, { onDelete: "cascade" }),
  performedAt: text("performed_at").notNull(),
  nextDueAt: text("next_due_at"),
  workDone: text("work_done").notNull(),
  cost: real("cost").notNull().default(0),
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
  managerEmployeeId: integer("manager_employee_id"),
  username: text("username"),
  passwordHash: text("password_hash"),
  title: text("title"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const admins = sqliteTable("admins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  title: text("title"),
  email: text("email"),
  isActive: integer("is_active").notNull().default(1),
  employeeId: integer("employee_id").references(() => employees.id, {
    onDelete: "set null",
  }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  lastLoginAt: text("last_login_at"),
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
  photoData: blob("photo_data"),
  photoMime: text("photo_mime"),
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
  unit: text("unit").notNull().default("m2"),
  tileWidthCm: real("tile_width_cm"),
  tileHeightCm: real("tile_height_cm"),
  tileThicknessCm: real("tile_thickness_cm"),
  piecesPerPallet: integer("pieces_per_pallet"),
  m2PerPallet: real("m2_per_pallet"),
  kgPerPallet: real("kg_per_pallet"),
  piecesPerPack: integer("pieces_per_pack"),
  m2PerPack: real("m2_per_pack"),
  kgPerPack: real("kg_per_pack"),
  unitWeightKg: real("unit_weight_kg"),
  palletFootprintLengthCm: real("pallet_footprint_length_cm"),
  palletFootprintWidthCm: real("pallet_footprint_width_cm"),
  replacesStandardPallets: real("replaces_standard_pallets").default(1),
  status: text("status").notNull().default("draft"),
  source: text("source").notNull().default("manual"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Learned mappings from invoice OCR / user edits → catalog product. */
export const productAliases = sqliteTable("product_aliases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  aliasKey: text("alias_key").notNull(),
  aliasType: text("alias_type").notNull(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  unit: text("unit"),
  ean: text("ean"),
  learnedFrom: text("learned_from").notNull().default("order"),
  hitCount: integer("hit_count").notNull().default(1),
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

/** Group leader ↔ warehouse zone (one zone → one leader; leader may have many zones). */
export const employeeWarehouseZones = sqliteTable(
  "employee_warehouse_zones",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    zone: text("zone").notNull().unique(),
    assignedAt: text("assigned_at").notNull(),
  }
);

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
  zone: text("zone"),
  sectorCountId: integer("sector_count_id"),
});

/** Per-zone count within an inventory session (sector open → count → close). */
export const inventorySectorCounts = sqliteTable("inventory_sector_counts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id")
    .notNull()
    .references(() => inventorySessions.id, { onDelete: "cascade" }),
  zone: text("zone").notNull(),
  status: text("status").notNull().default("counting"),
  startedAt: text("started_at").notNull(),
  closedAt: text("closed_at"),
  startedByEmployeeId: integer("started_by_employee_id").references(
    () => employees.id,
    { onDelete: "set null" }
  ),
  closedByEmployeeId: integer("closed_by_employee_id").references(
    () => employees.id,
    { onDelete: "set null" }
  ),
});

/** Book stock snapshot when an inventory session starts. */
export const inventorySnapshots = sqliteTable("inventory_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id")
    .notNull()
    .references(() => inventorySessions.id, { onDelete: "cascade" }),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  locationId: integer("location_id")
    .notNull()
    .references(() => warehouseLocations.id, { onDelete: "cascade" }),
  zone: text("zone"),
  quantityM2: real("quantity_m2").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const inventoryVarianceReports = sqliteTable("inventory_variance_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id")
    .notNull()
    .references(() => inventorySessions.id, { onDelete: "cascade" }),
  previousReportId: integer("previous_report_id"),
  createdAt: text("created_at").notNull(),
  appliedAt: text("applied_at"),
  totalLines: integer("total_lines").notNull().default(0),
  totalVarianceM2: real("total_variance_m2").notNull().default(0),
  notes: text("notes"),
});

export const inventoryVarianceLines = sqliteTable("inventory_variance_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reportId: integer("report_id")
    .notNull()
    .references(() => inventoryVarianceReports.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => products.id, {
    onDelete: "set null",
  }),
  ean: text("ean"),
  locationId: integer("location_id").references(() => warehouseLocations.id, {
    onDelete: "set null",
  }),
  zone: text("zone"),
  bookM2: real("book_m2").notNull().default(0),
  countedM2: real("counted_m2").notNull().default(0),
  differenceM2: real("difference_m2").notNull().default(0),
  previousCountedM2: real("previous_counted_m2"),
  changeSinceLastM2: real("change_since_last_m2"),
});

export const warehouseReports = sqliteTable("warehouse_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  reportType: text("report_type").notNull(),
  scope: text("scope").notNull(),
  zone: text("zone"),
  reportWeek: text("report_week"),
  category: text("category").notNull(),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const warehouseReportPhotos = sqliteTable("warehouse_report_photos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reportId: integer("report_id")
    .notNull()
    .references(() => warehouseReports.id, { onDelete: "cascade" }),
  photoPath: text("photo_path").notNull(),
  createdAt: text("created_at").notNull(),
});

export const warehouseReportTags = sqliteTable("warehouse_report_tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reportId: integer("report_id")
    .notNull()
    .references(() => warehouseReports.id, { onDelete: "cascade" }),
  taggedEmployeeId: integer("tagged_employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
});

export const warehouseReportZones = sqliteTable("warehouse_report_zones", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  reportId: integer("report_id")
    .notNull()
    .references(() => warehouseReports.id, { onDelete: "cascade" }),
  zone: text("zone").notNull(),
});

export const warehouseReportEditRequests = sqliteTable(
  "warehouse_report_edit_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    reportId: integer("report_id")
      .notNull()
      .references(() => warehouseReports.id, { onDelete: "cascade" }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    proposedBody: text("proposed_body").notNull(),
    reason: text("reason"),
    status: text("status").notNull().default("pending"),
    adminNote: text("admin_note"),
    createdAt: text("created_at").notNull(),
    reviewedAt: text("reviewed_at"),
  }
);

/** Excel/PDF dropped in a watch folder — admin approves before creating orders. */
export const invoiceImportQueue = sqliteTable(
  "invoice_import_queue",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    status: text("status").notNull().default("pending"),
    sourceFileName: text("source_file_name").notNull(),
    sourceFilePath: text("source_file_path"),
    sourceFolderDate: text("source_folder_date"),
    fileFingerprint: text("file_fingerprint").notNull(),
    parsedJson: text("parsed_json").notNull(),
    duplicateOrderId: integer("duplicate_order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    errorMessage: text("error_message"),
    orderId: integer("order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    adminNote: text("admin_note"),
    submittedAt: text("submitted_at").notNull(),
    reviewedAt: text("reviewed_at"),
  },
  (table) => ({
    fingerprintIdx: uniqueIndex("idx_invoice_import_queue_fingerprint").on(
      table.fileFingerprint
    ),
  })
);

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const employeeNotifications = sqliteTable("employee_notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  vehicleId: integer("vehicle_id").references(() => vehicles.id, {
    onDelete: "cascade",
  }),
  deliveryRound: integer("delivery_round"),
  message: text("message").notNull(),
  readAt: text("read_at"),
  createdAt: text("created_at").notNull(),
});
