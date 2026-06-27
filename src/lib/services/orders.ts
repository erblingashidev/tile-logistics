import { eq, and, gte, lte, desc, sql, like, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll, dbOne } from "@/lib/db/query";
import {
  orders,
  orderItems,
  assignments,
  vehicles,
  activityLogs,
  employees,
  orderEmployeeAssignments,
} from "@/lib/db/schema";
import {
  getOrderStaff,
  assignEmployeeToOrder,
  unassignEmployeeFromOrder,
  getDriverForVehicle,
} from "@/lib/services/employees";
import { listDeliveryProofs } from "@/lib/services/delivery-proofs";
import { updateOrderStatus } from "@/lib/services/order-status";
import { assertAdminPin } from "@/lib/auth/admin-pin";
import {
  autoAssignPickerTeam,
} from "@/lib/services/vehicle-defaults";
import { deleteDeliveryProofsForOrder } from "@/lib/services/delivery-proofs";
import { registerProductsFromOrder } from "@/lib/services/products";
import { validateTruckForOrder } from "@/lib/dispatch/validate-assignment";
import {
  isOrderReadyToShip,
  normalizeDeliveryTimePreference,
  validateRequestedDeliveryDate,
  DELIVERY_TIME_PREFERENCE_LABELS,
} from "@/lib/delivery-schedule";
import {
  getOrderLoadStatus,
  syncTruckDriverOnAssignments,
} from "@/lib/services/load-coordination";
import {
  computeOrderDisplayStage,
  ORDER_STAGE_LABELS,
} from "@/lib/order-display";
import {
  calculateOrderTotals,
  enrichOrderItem,
  checkVehicleCapacity,
  formatM2,
  type OrderItemInput,
} from "@/lib/calculations";
import { MAX_DELIVERY_ROUNDS, type OrderStatus, type EmployeeRole } from "@/lib/constants";
import { getLocationById, resolveLocation } from "@/lib/locations";
import {
  suggestRoutes,
  type RoutePlanFilters,
  type RouteSuggestion,
} from "@/lib/routes/planner";
import { logActivity } from "@/lib/logger";
import {
  assignRejectedMessage,
  formatLogMessage,
  inferLogCategory,
  orderAssignedMessage,
  orderAssignmentsClearedMessage,
  orderAssignBundleMessage,
  orderCreatedMessage,
  orderDeletedMessage,
  orderDeliveryResetMessage,
  orderUnassignedMessage,
  orderUpdatedMessage,
  type LogCategory,
} from "@/lib/log-messages";

export interface OrderItemPayload {
  productType: "tile" | "adhesive";
  productName?: string;
  productEan?: string;
  tileWidthCm?: number;
  tileHeightCm?: number;
  tileThicknessCm?: number;
  quantityM2?: number;
  weightKg?: number;
  manualPallets?: number;
  manualPieces?: number;
}

export interface OrderPayload {
  invoiceNumber: string;
  customerName: string;
  location: string;
  locationId?: string;
  region?: string;
  city?: string;
  lat?: number;
  lng?: number;
  price: number;
  orderDate: string;
  requestedDeliveryDate?: string | null;
  deliveryTimePreference?: string | null;
  status?: string;
  notes?: string;
  priority?: "normal" | "urgent";
  items: OrderItemPayload[];
}

function resolveLocationFields(
  location: string,
  locationId?: string,
  city?: string | null,
  lat?: number | null,
  lng?: number | null,
  region?: string | null
) {
  if (lat != null && lng != null) {
    const resolved = locationId ? getLocationById(locationId) : resolveLocation(location);
    return {
      location,
      locationId: locationId ?? null,
      region: region ?? resolved?.region ?? city ?? null,
      city: city ?? resolved?.city ?? null,
      lat,
      lng,
    };
  }
  if (locationId) {
    const loc = getLocationById(locationId);
    if (loc) {
      return {
        location: location || loc.name,
        locationId: loc.id,
        region: region ?? loc.region,
        city: loc.city,
        lat: loc.lat,
        lng: loc.lng,
      };
    }
  }
  const loc = resolveLocation(location);
  if (loc) {
    return {
      location: location || loc.name,
      locationId: loc.id,
      region: region ?? loc.region,
      city: loc.city,
      lat: loc.lat,
      lng: loc.lng,
    };
  }
  return {
    location: location.trim() || region || city || "—",
    locationId: null as string | null,
    region: region ?? null,
    city: city ?? null,
    lat: null as number | null,
    lng: null as number | null,
  };
}

function enrichItems(items: OrderItemPayload[]) {
  return items.map((item) => {
    const enriched = enrichOrderItem(item);
    return {
      productType: enriched.productType,
      productName: enriched.productName,
      productEan: item.productEan?.trim() || null,
      tileWidthCm: enriched.tileWidthCm,
      tileHeightCm: enriched.tileHeightCm,
      tileThicknessCm: enriched.tileThicknessCm,
      quantityM2: enriched.quantityM2,
      pieceCount: enriched.pieceCount,
      palletCount: enriched.palletCount,
      calculatedPieces: enriched.calculatedPieces,
      calculatedPallets: enriched.calculatedPallets,
      weightKg: enriched.weightKg,
    };
  });
}

export async function listOrders(filters?: {
  dateFrom?: string;
  dateTo?: string;
  minM2?: number;
  maxM2?: number;
  minPallets?: number;
  maxPallets?: number;
  minPrice?: number;
  maxPrice?: number;
  location?: string;
  city?: string;
  region?: string;
  employeeId?: number;
  pickerId?: number;
  driverId?: number;
  unassigned?: boolean;
  vehicleId?: number;
  deliveryRound?: number;
  /** When vehicleId set: workspace = on truck + unassigned; on_truck; unassigned */
  vehicleScope?: "workspace" | "on_truck" | "unassigned";
  status?: string;
  search?: string;
  hideDelivered?: boolean;
  readyToShip?: boolean;
  shipAsOfDate?: string;
}) {
  const db = await getDb();
  const conditions = [];

  if (filters?.dateFrom) conditions.push(gte(orders.orderDate, filters.dateFrom));
  if (filters?.dateTo) conditions.push(lte(orders.orderDate, filters.dateTo));
  if (filters?.minM2 != null)
    conditions.push(gte(orders.totalM2, filters.minM2));
  if (filters?.maxM2 != null)
    conditions.push(lte(orders.totalM2, filters.maxM2));
  if (filters?.minPallets != null)
    conditions.push(gte(orders.totalPallets, filters.minPallets));
  if (filters?.maxPallets != null)
    conditions.push(lte(orders.totalPallets, filters.maxPallets));
  if (filters?.minPrice != null)
    conditions.push(gte(orders.price, filters.minPrice));
  if (filters?.maxPrice != null)
    conditions.push(lte(orders.price, filters.maxPrice));
  if (filters?.location)
    conditions.push(like(orders.location, `%${filters.location}%`));
  if (filters?.city) conditions.push(eq(orders.city, filters.city));
  if (filters?.region) {
    conditions.push(eq(orders.region, filters.region));
  }
  if (filters?.pickerId) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM order_employee_assignments oea WHERE oea.order_id = ${orders.id} AND oea.employee_id = ${filters.pickerId} AND oea.role = 'picker')`
    );
  }
  if (filters?.driverId) {
    conditions.push(
      sql`(
        EXISTS (SELECT 1 FROM order_employee_assignments oea WHERE oea.order_id = ${orders.id} AND oea.employee_id = ${filters.driverId} AND oea.role = 'driver')
        OR EXISTS (SELECT 1 FROM assignments a WHERE a.order_id = ${orders.id} AND a.driver_employee_id = ${filters.driverId})
      )`
    );
  }
  if (filters?.employeeId) {
    conditions.push(
      sql`(
        EXISTS (SELECT 1 FROM order_employee_assignments oea WHERE oea.order_id = ${orders.id} AND oea.employee_id = ${filters.employeeId})
        OR EXISTS (SELECT 1 FROM assignments a WHERE a.order_id = ${orders.id} AND a.driver_employee_id = ${filters.employeeId})
      )`
    );
  }
  if (filters?.status) conditions.push(eq(orders.status, filters.status));
  if (filters?.unassigned) {
    conditions.push(
      sql`NOT EXISTS (SELECT 1 FROM assignments a WHERE a.order_id = ${orders.id})`
    );
  }
  if (filters?.vehicleId != null) {
    const round = filters.deliveryRound ?? 1;
    const scope = filters.vehicleScope ?? "workspace";
    if (scope === "on_truck") {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM assignments a WHERE a.order_id = ${orders.id} AND a.vehicle_id = ${filters.vehicleId} AND a.delivery_round = ${round})`
      );
    } else if (scope === "unassigned") {
      conditions.push(
        sql`NOT EXISTS (SELECT 1 FROM assignments a WHERE a.order_id = ${orders.id})`
      );
    } else {
      conditions.push(
        sql`(
          NOT EXISTS (SELECT 1 FROM assignments a WHERE a.order_id = ${orders.id})
          OR EXISTS (
            SELECT 1 FROM assignments a
            WHERE a.order_id = ${orders.id}
              AND a.vehicle_id = ${filters.vehicleId}
              AND a.delivery_round = ${round}
          )
        )`
      );
    }
  }
  if (filters?.search) {
    conditions.push(
      or(
        like(orders.invoiceNumber, `%${filters.search}%`),
        like(orders.customerName, `%${filters.search}%`),
        like(orders.location, `%${filters.search}%`)
      )!
    );
  }

  const rows =
    conditions.length > 0
      ? await dbAll(
          db
            .select()
            .from(orders)
            .where(and(...conditions))
            .orderBy(desc(orders.orderDate))
        )
      : await dbAll(
          db.select().from(orders).orderBy(desc(orders.orderDate))
        );

  const mapped = await Promise.all(
    rows.map(async (order) => {
      const proofs = await listDeliveryProofs(order.id);
      const deliveryStage = computeOrderDisplayStage(
        order.status,
        proofs.map((p) => p.phase)
      );
      return {
        ...order,
        assignment: await getOrderAssignment(order.id),
        staff: await getOrderStaff(order.id),
        proofs,
        deliveryStage,
        deliveryStageLabel: ORDER_STAGE_LABELS[deliveryStage],
        ...(await getOrderLoadStatus(order.id)),
        items: await dbAll(
          db
            .select()
            .from(orderItems)
            .where(eq(orderItems.orderId, order.id))
        ),
      };
    })
  );

  return mapped.filter((order) => {
    if (filters?.readyToShip && !isOrderReadyToShip(order, filters.shipAsOfDate)) {
      return false;
    }
    if (!filters?.hideDelivered) return true;
    return order.deliveryStage !== "delivered";
  });
}

export async function getOrder(id: number) {
  const db = await getDb();
  const order = await dbOne(
    db.select().from(orders).where(eq(orders.id, id))
  );
  if (!order) return null;
  const proofs = await listDeliveryProofs(id);
  const proofPhases = proofs.map((p) => p.phase);
  const reconciledStatus = await reconcileOrderStatusFromProofs(
    id,
    order.status,
    proofPhases
  );
  const deliveryStage = computeOrderDisplayStage(
    reconciledStatus,
    proofPhases
  );
  return {
    ...order,
    status: reconciledStatus,
    items: await dbAll(
      db.select().from(orderItems).where(eq(orderItems.orderId, id))
    ),
    assignment: await getOrderAssignment(id),
    staff: await getOrderStaff(id),
    proofs,
    deliveryStage,
    deliveryStageLabel: ORDER_STAGE_LABELS[deliveryStage],
    ...(await getOrderLoadStatus(id)),
  };
}

async function reconcileOrderStatusFromProofs(
  orderId: number,
  currentStatus: string,
  proofPhases: string[]
): Promise<string> {
  if (currentStatus === "cancelled") return currentStatus;

  let target: OrderStatus | null = null;
  if (proofPhases.includes("delivered")) target = "delivered";
  else if (
    proofPhases.includes("departed") ||
    proofPhases.includes("arrived")
  ) {
    target = "in_transit";
  }

  if (target && target !== currentStatus) {
    await updateOrderStatus(orderId, target);
    return target;
  }
  return currentStatus;
}

async function getOrderAssignment(orderId: number) {
  const db = await getDb();
  const row = await dbOne(
    db
      .select({
        id: assignments.id,
        deliveryRound: assignments.deliveryRound,
        assignedAt: assignments.assignedAt,
        vehicleId: assignments.vehicleId,
        vehicleName: vehicles.name,
        plateNumber: vehicles.plateNumber,
        driverEmployeeId: assignments.driverEmployeeId,
      })
      .from(assignments)
      .innerJoin(vehicles, eq(assignments.vehicleId, vehicles.id))
      .where(eq(assignments.orderId, orderId))
      .orderBy(desc(assignments.assignedAt))
  );

  if (!row) return null;

  let driverName: string | null = null;
  const driverId =
    row.driverEmployeeId ??
    (await getDriverForVehicle(row.vehicleId))?.id ??
    null;
  if (driverId) {
    const driver = await dbOne(
      db
        .select({ name: employees.name })
        .from(employees)
        .where(eq(employees.id, driverId))
    );
    driverName = driver?.name ?? null;
  }

  return { ...row, driverName };
}

export async function createOrder(payload: OrderPayload) {
  const db = await getDb();
  const now = new Date().toISOString();
  const requestedDeliveryDate = payload.requestedDeliveryDate?.trim() || null;
  const deliveryTimePreference = normalizeDeliveryTimePreference(
    payload.deliveryTimePreference
  );
  const scheduleError = validateRequestedDeliveryDate(
    payload.orderDate,
    requestedDeliveryDate
  );
  if (scheduleError) {
    throw new Error(scheduleError);
  }

  const totals = calculateOrderTotals(payload.items as OrderItemInput[]);
  const enriched = enrichItems(payload.items);
  const locFields = resolveLocationFields(
    payload.location,
    payload.locationId,
    payload.city,
    payload.lat,
    payload.lng,
    payload.region
  );

  const inserted = await dbOne(
    db
      .insert(orders)
      .values({
        invoiceNumber: payload.invoiceNumber,
        customerName: payload.customerName,
        location: locFields.location,
        locationId: locFields.locationId,
        region: locFields.region,
        city: locFields.city,
        lat: locFields.lat,
        lng: locFields.lng,
        price: payload.price,
        orderDate: payload.orderDate,
        requestedDeliveryDate,
        deliveryTimePreference,
        status: payload.status ?? "pending",
        totalM2: totals.totalM2,
        totalPieces: totals.totalPieces,
        totalPallets: totals.totalPallets,
        totalWeightKg: totals.totalWeightKg,
        notes: payload.notes ?? null,
        priority: payload.priority ?? "normal",
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: orders.id })
  );

  const orderId = inserted!.id;
  for (const item of enriched) {
    await db.insert(orderItems).values({ orderId, ...item });
  }

  await registerProductsFromOrder(orderId);

  await logActivity(
    "create",
    "order",
    orderId,
    orderCreatedMessage({
      invoiceNumber: payload.invoiceNumber,
      customerName: payload.customerName,
      location: payload.location,
      totalM2: totals.totalM2,
      totalPallets: totals.totalPallets,
      totalPieces: totals.totalPieces,
    }),
    {
      category: "orders",
      details: {
        invoiceNumber: payload.invoiceNumber,
        location: payload.location,
        totals,
      },
    }
  );

  return getOrder(orderId);
}

export async function updateOrder(id: number, payload: OrderPayload) {
  const db = await getDb();
  const existing = await getOrder(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const requestedDeliveryDate = payload.requestedDeliveryDate?.trim() || null;
  const deliveryTimePreference = normalizeDeliveryTimePreference(
    payload.deliveryTimePreference
  );
  const scheduleError = validateRequestedDeliveryDate(
    payload.orderDate,
    requestedDeliveryDate
  );
  if (scheduleError) {
    throw new Error(scheduleError);
  }

  const totals = calculateOrderTotals(payload.items as OrderItemInput[]);
  const enriched = enrichItems(payload.items);
  const locFields = resolveLocationFields(
    payload.location,
    payload.locationId,
    payload.city,
    payload.lat,
    payload.lng,
    payload.region
  );

  await db
    .update(orders)
    .set({
      invoiceNumber: payload.invoiceNumber,
      customerName: payload.customerName,
      location: locFields.location,
      locationId: locFields.locationId,
      region: locFields.region,
      city: locFields.city,
      lat: locFields.lat,
      lng: locFields.lng,
      price: payload.price,
      orderDate: payload.orderDate,
      requestedDeliveryDate,
      deliveryTimePreference,
      status: payload.status ?? existing.status,
      totalM2: totals.totalM2,
      totalPieces: totals.totalPieces,
      totalPallets: totals.totalPallets,
      totalWeightKg: totals.totalWeightKg,
      notes: payload.notes ?? null,
      priority: payload.priority ?? undefined,
      updatedAt: now,
    })
    .where(eq(orders.id, id));

  await db.delete(orderItems).where(eq(orderItems.orderId, id));
  for (const item of enriched) {
    await db.insert(orderItems).values({ orderId: id, ...item });
  }

  const changes: string[] = [];
  if (existing.invoiceNumber !== payload.invoiceNumber) {
    changes.push(`invoice ${existing.invoiceNumber} → ${payload.invoiceNumber}`);
  }
  if (existing.customerName !== payload.customerName) {
    changes.push(`customer ${existing.customerName} → ${payload.customerName}`);
  }
  if (existing.location !== payload.location) {
    changes.push(`location ${existing.location} → ${payload.location}`);
  }
  if (existing.totalPallets !== totals.totalPallets) {
    changes.push(`pallets ${existing.totalPallets} → ${totals.totalPallets}`);
  }
  if (Math.abs(existing.totalM2 - totals.totalM2) > 0.01) {
    changes.push(`m² ${formatM2(existing.totalM2)} → ${formatM2(totals.totalM2)}`);
  }
  if (Math.abs(existing.price - payload.price) > 0.01) {
    changes.push(`price ${existing.price} → ${payload.price}`);
  }

  await logActivity(
    "update",
    "order",
    id,
    orderUpdatedMessage(payload.invoiceNumber, changes),
    {
      category: "orders",
      details: {
        invoiceNumber: payload.invoiceNumber,
        changes,
        totals,
      },
    }
  );
  return getOrder(id);
}

export async function deleteOrder(id: number) {
  const db = await getDb();
  const existing = await getOrder(id);
  if (!existing) return false;
  await db.delete(orders).where(eq(orders.id, id));
  await logActivity(
    "delete",
    "order",
    id,
    orderDeletedMessage(existing.invoiceNumber, existing.location),
    {
      category: "orders",
      details: { invoiceNumber: existing.invoiceNumber, location: existing.location },
    }
  );
  return true;
}

export async function assignOrderToVehicle(
  orderId: number,
  vehicleId: number,
  deliveryRound: number,
  ignoreWeightWarning = false,
  ignoreCraneRule = false
) {
  if (deliveryRound < 1 || deliveryRound > MAX_DELIVERY_ROUNDS) {
    return {
      ok: false,
      error: `Delivery round must be between 1 and ${MAX_DELIVERY_ROUNDS}`,
    };
  }

  const db = await getDb();
  const order = await getOrder(orderId);
  if (!order) return { ok: false, error: "Order not found" };

  const craneCheck = await validateTruckForOrder(orderId, vehicleId, {
    ignoreCraneRule,
  });
  if (!craneCheck.ok) {
    return {
      ok: false as const,
      error: craneCheck.error,
      requiresCrane: craneCheck.requiresCrane,
    };
  }

  const vehicle = await dbOne(
    db.select().from(vehicles).where(eq(vehicles.id, vehicleId))
  );
  if (!vehicle) return { ok: false, error: "Vehicle not found" };

  const linkedDriver = await getDriverForVehicle(vehicleId);
  const driverEmployeeId = linkedDriver?.id ?? null;

  const existingOnVehicle = (
    await dbAll(
      db
        .select({ order: orders })
        .from(assignments)
        .innerJoin(orders, eq(assignments.orderId, orders.id))
        .where(
          and(
            eq(assignments.vehicleId, vehicleId),
            eq(assignments.deliveryRound, deliveryRound),
            sql`${assignments.orderId} != ${orderId}`
          )
        )
    )
  ).map((r) => r.order);

  const existingTotals = existingOnVehicle.map((o) => ({
    totalM2: o.totalM2,
    totalPieces: o.totalPieces,
    totalPallets: o.totalPallets,
    totalWeightKg: o.totalWeightKg,
  }));

  const newTotals = {
    totalM2: order.totalM2,
    totalPieces: order.totalPieces,
    totalPallets: order.totalPallets,
    totalWeightKg: order.totalWeightKg,
  };

  const capacity = checkVehicleCapacity(
    existingTotals,
    newTotals,
    vehicle.maxPallets,
    vehicle.maxWeightKg
  );

  if (!capacity.ok) {
    await logActivity(
      "assign_rejected",
      "order",
      orderId,
      assignRejectedMessage(
        order.invoiceNumber,
        vehicle.name,
        capacity.message ?? "Capacity limit reached"
      ),
      {
        category: "deliveries",
        details: {
          invoiceNumber: order.invoiceNumber,
          vehicleId,
          vehicleName: vehicle.name,
          deliveryRound,
          reason: capacity.message,
        },
      }
    );
    return { ok: false, error: capacity.message, capacity };
  }

  if (!capacity.weightOk && !ignoreWeightWarning) {
    return {
      ok: false,
      isWeightWarning: true,
      error: capacity.weightWarning,
      capacity,
    };
  }

  const now = new Date().toISOString();

  // One active truck per order — replace any previous assignment (avoids stale rows
  // when changing truck or delivery round).
  const previousAssignments = await dbAll(
    db
      .select({ id: assignments.id, vehicleId: assignments.vehicleId })
      .from(assignments)
      .where(eq(assignments.orderId, orderId))
  );

  for (const prev of previousAssignments) {
    await db.delete(assignments).where(eq(assignments.id, prev.id));
    await syncTruckDriverOnAssignments(prev.vehicleId);
  }

  await db.insert(assignments).values({
    orderId,
    vehicleId,
    driverEmployeeId,
    deliveryRound,
    assignedAt: now,
  });

  if (driverEmployeeId) {
    await assignEmployeeToOrder(orderId, driverEmployeeId, "driver");
  }

  await syncTruckDriverOnAssignments(vehicleId);

  const staff = await getOrderStaff(orderId);

  await db
    .update(orders)
    .set({ status: "assigned", updatedAt: now })
    .where(eq(orders.id, orderId));

  await logActivity(
    "assign",
    "order",
    orderId,
    orderAssignedMessage(
      order.invoiceNumber,
      vehicle.name,
      vehicle.plateNumber,
      deliveryRound,
      !capacity.weightOk && ignoreWeightWarning,
      staff.picker?.employeeName,
      staff.driver?.employeeName ?? linkedDriver?.name ?? null
    ),
    {
      category: "deliveries",
      details: {
        invoiceNumber: order.invoiceNumber,
        vehicleId,
        vehicleName: vehicle.name,
        plateNumber: vehicle.plateNumber,
        deliveryRound,
        capacity,
        weightWarningIgnored: !capacity.weightOk && ignoreWeightWarning,
        pickerName: staff.picker?.employeeName,
        driverName: staff.driver?.employeeName,
        employeeId: driverEmployeeId ?? staff.picker?.employeeId,
      },
    }
  );

  return {
    ok: true,
    capacity,
    weightWarning: capacity.weightWarning,
    craneWarning: craneCheck.ok ? craneCheck.warning : undefined,
    order: await getOrder(orderId),
  };
}

export async function unassignOrder(orderId: number, deliveryRound?: number) {
  const db = await getDb();
  const existing = await getOrder(orderId);
  if (deliveryRound) {
    await db
      .delete(assignments)
      .where(
        and(
          eq(assignments.orderId, orderId),
          eq(assignments.deliveryRound, deliveryRound)
        )
      );
  } else {
    await db.delete(assignments).where(eq(assignments.orderId, orderId));
  }
  await db
    .update(orders)
    .set({ status: "pending", updatedAt: new Date().toISOString() })
    .where(eq(orders.id, orderId));
  if (existing) {
    await logActivity(
      "unassign",
      "order",
      orderId,
      orderUnassignedMessage(existing.invoiceNumber, deliveryRound),
      {
        category: "deliveries",
        details: {
          invoiceNumber: existing.invoiceNumber,
          deliveryRound,
        },
      }
    );
  }
  return getOrder(orderId);
}

const ASSIGNMENT_LOG_ACTIONS = new Set([
  "assign",
  "unassign",
  "staff_assign",
  "staff_unassign",
  "assignments_clear",
  "assign_rejected",
  "assign_bundle",
  "delivery_reset",
]);

export type AssignmentClearScope = {
  truck?: boolean;
  picker?: boolean;
  driver?: boolean;
  helpers?: boolean;
};

function resolveClearScope(scope?: AssignmentClearScope) {
  const all = !scope || Object.keys(scope).length === 0;
  return {
    truck: all || scope?.truck === true,
    picker: all || scope?.picker === true,
    driver: all || scope?.driver === true,
    helpers: all || scope?.helpers === true,
  };
}

function orderHasDeliveryProgress(
  order: NonNullable<Awaited<ReturnType<typeof getOrder>>>
): boolean {
  return (order.proofs ?? []).some((p) =>
    ["loaded", "load_skipped", "departed", "arrived", "delivered"].includes(
      p.phase
    )
  );
}

function checkAssignmentChangePermission(
  order: NonNullable<Awaited<ReturnType<typeof getOrder>>>,
  options?: { force?: boolean; adminPin?: string; skipCheck?: boolean }
):
  | { ok: true }
  | { ok: false; error: string; requiresPin?: true; requiresForce?: true } {
  if (options?.skipCheck) return { ok: true };
  if (!orderHasDeliveryProgress(order)) return { ok: true };

  if (options?.adminPin) {
    const pin = assertAdminPin(options.adminPin);
    if (!pin.ok) return pin;
    return { ok: true };
  }

  if (options?.force) return { ok: true };

  const stage = order.deliveryStage ?? order.status;
  return {
    ok: false,
    error: `Delivery already started (${stage}). Enter admin PIN to change assignments.`,
    requiresPin: true,
  };
}

export async function clearOrderAssignments(
  orderId: number,
  options?: {
    force?: boolean;
    adminPin?: string;
    scope?: AssignmentClearScope;
    skipPermissionCheck?: boolean;
  }
) {
  const order = await getOrder(orderId);
  if (!order) return { ok: false as const, error: "Order not found" };

  const permission = checkAssignmentChangePermission(order, options);
  if (!permission.ok) return permission;

  const scope = resolveClearScope(options?.scope);
  const cleared: string[] = [];

  if (scope.picker && order.staff?.picker) {
    await unassignEmployeeFromOrder(orderId, "picker");
    cleared.push("picker");
  }
  if (
    scope.driver &&
    order.staff?.staff?.some((s) => s.role === "driver")
  ) {
    await unassignEmployeeFromOrder(orderId, "driver");
    cleared.push("driver");
  }
  if (
    scope.helpers &&
    order.staff?.staff?.some((s) => s.role === "unloader")
  ) {
    await unassignEmployeeFromOrder(orderId, "unloader");
    cleared.push("helpers");
  }

  if (scope.truck && order.assignment) {
    const db = await getDb();
    await db.delete(assignments).where(eq(assignments.orderId, orderId));
    await db
      .update(orders)
      .set({ status: "pending", updatedAt: new Date().toISOString() })
      .where(eq(orders.id, orderId));
    if (!cleared.includes("driver") && order.assignment.driverName) {
      cleared.push("driver");
    }
    cleared.push("truck");
  } else if (
    scope.truck &&
    !order.assignment &&
    order.status === "assigned"
  ) {
    const db = await getDb();
    await db
      .update(orders)
      .set({ status: "pending", updatedAt: new Date().toISOString() })
      .where(eq(orders.id, orderId));
  }

  const uniqueCleared = [...new Set(cleared)];

  if (uniqueCleared.length === 0) {
    return { ok: true as const, order: await getOrder(orderId), cleared: [] };
  }

  await logActivity(
    "assignments_clear",
    "order",
    orderId,
    orderAssignmentsClearedMessage(order.invoiceNumber, uniqueCleared),
    {
      category: "deliveries",
      details: {
        invoiceNumber: order.invoiceNumber,
        cleared: uniqueCleared,
        scope,
        summary: orderAssignmentsClearedMessage(
          order.invoiceNumber,
          uniqueCleared
        ),
      },
    }
  );

  return {
    ok: true as const,
    order: await getOrder(orderId),
    cleared: uniqueCleared,
  };
}

export async function bulkClearOrderAssignments(
  orderIds: number[],
  options?: Parameters<typeof clearOrderAssignments>[1]
) {
  const results = await Promise.all(
    orderIds.map(async (id) => {
      const result = await clearOrderAssignments(id, options);
      return { orderId: id, ...result };
    })
  );
  const failed = results.filter((r) => !r.ok);
  return {
    ok: failed.length === 0,
    results,
    clearedCount: results.filter((r) => r.ok && "cleared" in r && r.cleared.length > 0)
      .length,
  };
}

export async function resetOrderDelivery(
  orderId: number,
  options: { adminPin: string }
) {
  const pin = assertAdminPin(options.adminPin);
  if (!pin.ok) return pin;

  const order = await getOrder(orderId);
  if (!order) return { ok: false as const, error: "Order not found" };

  const proofCount = await deleteDeliveryProofsForOrder(orderId);

  await clearOrderAssignments(orderId, {
    adminPin: options.adminPin,
    skipPermissionCheck: true,
    scope: { truck: true, picker: true, driver: true, helpers: true },
  });

  const db = await getDb();
  await db
    .update(orders)
    .set({ status: "pending", updatedAt: new Date().toISOString() })
    .where(eq(orders.id, orderId));

  await logActivity(
    "delivery_reset",
    "order",
    orderId,
    orderDeliveryResetMessage(order.invoiceNumber),
    {
      category: "deliveries",
      details: {
        invoiceNumber: order.invoiceNumber,
        proofsRemoved: proofCount,
        summary: orderDeliveryResetMessage(order.invoiceNumber),
      },
    }
  );

  return {
    ok: true as const,
    order: await getOrder(orderId),
    proofsRemoved: proofCount,
  };
}

function scheduleAssignmentWarning(
  order: NonNullable<Awaited<ReturnType<typeof getOrder>>>
): string | undefined {
  if (order.requestedDeliveryDate && !isOrderReadyToShip(order)) {
    return `Customer requested delivery on ${order.requestedDeliveryDate}. You can assign now, but do not ship before that date.`;
  }
  const pref = normalizeDeliveryTimePreference(order.deliveryTimePreference);
  if (pref === "morning") {
    return `Customer prefers ${DELIVERY_TIME_PREFERENCE_LABELS.morning.toLowerCase()}.`;
  }
  if (pref === "afternoon") {
    return `Customer prefers ${DELIVERY_TIME_PREFERENCE_LABELS.afternoon.toLowerCase()}.`;
  }
  return undefined;
}

export async function assignOrderBundle(input: {
  orderId: number;
  vehicleId: number;
  deliveryRound: number;
  pickerId?: number | null;
  autoAssignTeam?: boolean;
  ignoreWeightWarning?: boolean;
  ignoreCraneRule?: boolean;
}) {
  const truck = await assignOrderToVehicle(
    input.orderId,
    input.vehicleId,
    input.deliveryRound,
    input.ignoreWeightWarning ?? false,
    input.ignoreCraneRule ?? false
  );
  if (!truck.ok) return truck;

  const pickerId = input.pickerId ?? null;

  if (pickerId) {
    if (input.autoAssignTeam !== false) {
      await autoAssignPickerTeam(input.orderId, pickerId);
    } else {
      await assignEmployeeToOrder(input.orderId, pickerId, "picker");
    }
  }

  const order = (await getOrder(input.orderId))!;
  const db = await getDb();
  const vehicle = await dbOne(
    db
      .select({ name: vehicles.name })
      .from(vehicles)
      .where(eq(vehicles.id, input.vehicleId))
  );

  await logActivity(
    "assign_bundle",
    "order",
    input.orderId,
    orderAssignBundleMessage(
      order.invoiceNumber,
      vehicle?.name ?? "truck",
      order.staff?.picker?.employeeName
    ),
    {
      category: "deliveries",
      details: {
        invoiceNumber: order.invoiceNumber,
        vehicleId: input.vehicleId,
        deliveryRound: input.deliveryRound,
        pickerId,
        summary: orderAssignBundleMessage(
          order.invoiceNumber,
          vehicle?.name ?? "truck",
          order.staff?.picker?.employeeName
        ),
      },
    }
  );

  return {
    ok: true as const,
    order: await getOrder(input.orderId),
    craneWarning: truck.craneWarning,
    scheduleWarning: scheduleAssignmentWarning(order),
  };
}

export async function listOrderAssignmentTimeline(orderId: number) {
  const logs = await listLogs({ entityId: orderId, entityType: "order" });
  return logs.filter((log) => ASSIGNMENT_LOG_ACTIONS.has(log.action));
}

export { updateOrderStatus } from "@/lib/services/order-status";

/** Orders visible in the employee portal — role-aware. */
export async function listOrdersForEmployee(
  employeeId: number,
  options?: { roles?: EmployeeRole[] }
) {
  const roles = options?.roles ?? [];
  const db = await getDb();

  const employee = await dbOne(
    db
      .select({ assignedVehicleId: employees.assignedVehicleId })
      .from(employees)
      .where(eq(employees.id, employeeId))
  );

  let ids: number[] = [];

  // Drivers see only their assigned truck (unless admin changes their vehicle).
  if (roles.includes("driver")) {
    if (employee?.assignedVehicleId) {
      ids = (
        await dbAll(
          db
            .select({ orderId: assignments.orderId })
            .from(assignments)
            .where(eq(assignments.vehicleId, employee.assignedVehicleId))
        )
      ).map((r) => r.orderId);
    } else {
      ids = (
        await dbAll(
          db
            .select({ orderId: assignments.orderId })
            .from(assignments)
            .where(eq(assignments.driverEmployeeId, employeeId))
        )
      ).map((r) => r.orderId);
    }
  } else if (roles.some((r) => r === "picker" || r === "unloader")) {
    ids = (
      await dbAll(
        db
          .select({ orderId: orderEmployeeAssignments.orderId })
          .from(orderEmployeeAssignments)
          .where(eq(orderEmployeeAssignments.employeeId, employeeId))
      )
    ).map((r) => r.orderId);
  } else {
    const staffOrderIds = (
      await dbAll(
        db
          .select({ orderId: orderEmployeeAssignments.orderId })
          .from(orderEmployeeAssignments)
          .where(eq(orderEmployeeAssignments.employeeId, employeeId))
      )
    ).map((r) => r.orderId);

    const driverOrderIds = (
      await dbAll(
        db
          .select({ orderId: assignments.orderId })
          .from(assignments)
          .where(eq(assignments.driverEmployeeId, employeeId))
      )
    ).map((r) => r.orderId);

    let vehicleOrderIds: number[] = [];
    if (employee?.assignedVehicleId) {
      vehicleOrderIds = (
        await dbAll(
          db
            .select({ orderId: assignments.orderId })
            .from(assignments)
            .where(eq(assignments.vehicleId, employee.assignedVehicleId))
        )
      ).map((r) => r.orderId);
    }

    ids = [
      ...new Set([...staffOrderIds, ...driverOrderIds, ...vehicleOrderIds]),
    ];
  }

  if (ids.length === 0) return [];

  const orderList = await Promise.all(ids.map((id) => getOrder(id)));
  return orderList
    .filter((o): o is NonNullable<typeof o> => o != null)
    .filter((o) => o.status !== "cancelled")
    .sort((a, b) => b.orderDate.localeCompare(a.orderDate));
}

export async function getOrdersGroupedByLocation() {
  const db = await getDb();
  return dbAll(
    db
      .select({
        region: sql<string>`coalesce(${orders.region}, ${orders.city}, 'Unknown')`,
        orderCount: sql<number>`count(*)`,
        totalM2: sql<number>`sum(${orders.totalM2})`,
        totalPallets: sql<number>`sum(${orders.totalPallets})`,
        totalPieces: sql<number>`sum(${orders.totalPieces})`,
        totalPrice: sql<number>`sum(${orders.price})`,
        totalWeightKg: sql<number>`sum(${orders.totalWeightKg})`,
      })
      .from(orders)
      .groupBy(sql`coalesce(${orders.region}, ${orders.city}, 'Unknown')`)
      .orderBy(sql`coalesce(${orders.region}, ${orders.city}, 'Unknown')`)
  );
}

export async function getVehicleLoad(vehicleId: number, deliveryRound: number) {
  const db = await getDb();
  const assigned = await dbAll(
    db
      .select({ order: orders })
      .from(assignments)
      .innerJoin(orders, eq(assignments.orderId, orders.id))
      .where(
        and(
          eq(assignments.vehicleId, vehicleId),
          eq(assignments.deliveryRound, deliveryRound)
        )
      )
  );

  const totals = assigned.reduce(
    (acc, { order }) => ({
      pallets: acc.pallets + order.totalPallets,
      weightKg: acc.weightKg + order.totalWeightKg,
      m2: acc.m2 + order.totalM2,
      orders: acc.orders + 1,
    }),
    { pallets: 0, weightKg: 0, m2: 0, orders: 0 }
  );

  return { assignedOrders: assigned.map((a) => a.order), totals };
}

export async function listLogs(filters?: {
  dateFrom?: string;
  dateTo?: string;
  category?: LogCategory;
  search?: string;
  employeeId?: number;
  entityId?: number;
  entityType?: string;
}) {
  const db = await getDb();
  const conditions = [];
  if (filters?.dateFrom)
    conditions.push(gte(activityLogs.createdAt, filters.dateFrom));
  if (filters?.dateTo)
    conditions.push(lte(activityLogs.createdAt, filters.dateTo));
  if (filters?.category)
    conditions.push(eq(activityLogs.category, filters.category));
  if (filters?.entityId != null)
    conditions.push(eq(activityLogs.entityId, filters.entityId));
  if (filters?.entityType)
    conditions.push(eq(activityLogs.entityType, filters.entityType));

  const rows =
    conditions.length > 0
      ? await dbAll(
          db
            .select()
            .from(activityLogs)
            .where(and(...conditions))
            .orderBy(desc(activityLogs.createdAt))
        )
      : await dbAll(
          db
            .select()
            .from(activityLogs)
            .orderBy(desc(activityLogs.createdAt))
            .limit(500)
        );

  let mapped = rows.map((log) => {
    const category =
      (log.category as LogCategory | null) ??
      inferLogCategory(log.action, log.entityType);
    return {
      ...log,
      category,
      message: log.message ?? formatLogMessage(log),
      detailsParsed: log.details ? JSON.parse(log.details) : null,
    };
  });

  if (filters?.search) {
    const q = filters.search.toLowerCase();
    mapped = mapped.filter(
      (log) =>
        log.message.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q)
    );
  }

  if (filters?.employeeId) {
    const id = filters.employeeId;
    mapped = mapped.filter((log) => {
      const d = log.detailsParsed as Record<string, unknown> | null;
      return d?.employeeId === id;
    });
  }

  return mapped;
}

export async function getReportData(filters: {
  dateFrom?: string;
  dateTo?: string;
  hourFrom?: number;
  hourTo?: number;
  employeeId?: number;
  pickerId?: number;
  driverId?: number;
}) {
  const all = await listOrders({
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    employeeId: filters.employeeId,
    pickerId: filters.pickerId,
    driverId: filters.driverId,
  });

  let filtered = all;
  if (filters.hourFrom != null || filters.hourTo != null) {
    filtered = all.filter((order) => {
      const hour = new Date(order.createdAt).getHours();
      if (filters.hourFrom != null && hour < filters.hourFrom) return false;
      if (filters.hourTo != null && hour > filters.hourTo) return false;
      return true;
    });
  }

  const byStatus = filtered.reduce(
    (acc, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return {
    orders: filtered,
    summary: {
      count: filtered.length,
      totalM2: filtered.reduce((s, o) => s + o.totalM2, 0),
      totalPallets: filtered.reduce((s, o) => s + o.totalPallets, 0),
      totalPrice: filtered.reduce((s, o) => s + o.price, 0),
      byStatus,
    },
  };
}

export async function getDashboardStats() {
  const all = await listOrders();
  const unassigned = all.filter((o) => !o.assignment);
  const db = await getDb();
  const vehicleRows = await dbAll(db.select().from(vehicles));
  return {
    totalOrders: all.length,
    unassignedOrders: unassigned.length,
    totalPalletsPending: unassigned.reduce((s, o) => s + o.totalPallets, 0),
    vehiclesAvailable: vehicleRows.filter((v) => v.status === "available")
      .length,
  };
}

export async function getRoutePlans(
  filters: RoutePlanFilters & {
    deliveryRound?: number;
    employeeId?: number;
    pickerId?: number;
    driverId?: number;
  }
): Promise<RouteSuggestion[]> {
  const all = await listOrders({
    unassigned: filters.unassignedOnly !== false,
    readyToShip: true,
    region: filters.region,
    city: filters.city,
    employeeId: filters.employeeId,
    pickerId: filters.pickerId,
    driverId: filters.driverId,
  });
  const ordersWithAssignment = all.map((o) => ({
    ...o,
    assignment: o.assignment,
  }));

  let vehicleUsedPallets = 0;
  let vehicleUsedWeightKg = 0;
  if (filters.vehicleId && filters.deliveryRound) {
    const load = await getVehicleLoad(filters.vehicleId, filters.deliveryRound);
    vehicleUsedPallets = load.totals.pallets;
    vehicleUsedWeightKg = load.totals.weightKg;
  }

  return suggestRoutes(ordersWithAssignment, {
    ...filters,
    vehicleUsedPallets,
    vehicleUsedWeightKg,
  });
}

export async function assignRouteToVehicle(
  orderIds: number[],
  vehicleId: number,
  deliveryRound: number,
  ignoreWeightWarning = false,
  ignoreCraneRule = false
) {
  const results: Array<{
    orderId: number;
    ok: boolean;
    error?: string;
    requiresCrane?: boolean;
  }> = [];
  for (const orderId of orderIds) {
    const result = await assignOrderBundle({
      orderId,
      vehicleId,
      deliveryRound,
      autoAssignTeam: true,
      ignoreWeightWarning,
      ignoreCraneRule,
    });
    results.push({
      orderId,
      ok: result.ok,
      error: "error" in result ? result.error : undefined,
      requiresCrane:
        "requiresCrane" in result ? result.requiresCrane : undefined,
    });
    if (!result.ok && !("isWeightWarning" in result && result.isWeightWarning)) {
      break;
    }
  }
  return results;
}

/** Move one or more orders to another truck (e.g. breakdown). Keeps picker by default. */
export async function transferOrdersToVehicle(input: {
  orderIds: number[];
  vehicleId: number;
  deliveryRound: number;
  preservePicker?: boolean;
  ignoreWeightWarning?: boolean;
  ignoreCraneRule?: boolean;
}) {
  const db = await getDb();
  const vehicle = await dbOne(
    db.select().from(vehicles).where(eq(vehicles.id, input.vehicleId))
  );
  if (!vehicle) {
    return { ok: false as const, error: "Vehicle not found", results: [] };
  }

  const results: Array<{
    orderId: number;
    ok: boolean;
    error?: string;
    requiresCrane?: boolean;
    isWeightWarning?: boolean;
    invoiceNumber?: string;
  }> = [];

  for (const orderId of input.orderIds) {
    const order = await getOrder(orderId);
    if (!order) {
      results.push({ orderId, ok: false, error: "Order not found" });
      continue;
    }
    if (order.status === "delivered" || order.status === "cancelled") {
      results.push({
        orderId,
        ok: false,
        error: `Cannot transfer ${order.status} order`,
        invoiceNumber: order.invoiceNumber,
      });
      continue;
    }

    const fromVehicle = order.assignment?.vehicleName ?? "previous truck";
    const pickerId =
      input.preservePicker !== false
        ? (order.staff?.picker?.employeeId ?? null)
        : null;

    const result = await assignOrderBundle({
      orderId,
      vehicleId: input.vehicleId,
      deliveryRound: input.deliveryRound,
      pickerId,
      autoAssignTeam: pickerId == null,
      ignoreWeightWarning: input.ignoreWeightWarning ?? false,
      ignoreCraneRule: input.ignoreCraneRule ?? false,
    });

    if (!result.ok) {
      results.push({
        orderId,
        ok: false,
        error: "error" in result ? result.error : "Transfer failed",
        requiresCrane:
          "requiresCrane" in result ? result.requiresCrane : undefined,
        isWeightWarning:
          "isWeightWarning" in result ? result.isWeightWarning : undefined,
        invoiceNumber: order.invoiceNumber,
      });
      if ("isWeightWarning" in result && result.isWeightWarning) {
        break;
      }
      if (!("requiresCrane" in result && result.requiresCrane)) {
        break;
      }
      continue;
    }

    await logActivity(
      "transfer",
      "order",
      orderId,
      `${order.invoiceNumber} transferred from ${fromVehicle} to ${vehicle.name} (${vehicle.plateNumber}) — round ${input.deliveryRound}.`,
      {
        category: "deliveries",
        details: {
          invoiceNumber: order.invoiceNumber,
          fromVehicle,
          vehicleId: input.vehicleId,
          vehicleName: vehicle.name,
          deliveryRound: input.deliveryRound,
        },
      }
    );

    results.push({
      orderId,
      ok: true,
      invoiceNumber: order.invoiceNumber,
    });
  }

  const transferred = results.filter((r) => r.ok).length;
  return {
    ok: transferred === input.orderIds.length,
    transferred,
    results,
    vehicleName: vehicle.name,
  };
}

export {
  assignEmployeeToOrder,
  unassignEmployeeFromOrder,
  getOrderStaff,
} from "@/lib/services/employees";
