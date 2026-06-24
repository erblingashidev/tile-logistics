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
