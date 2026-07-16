import { eq, and, gte, lte, desc, sql, like, or, inArray } from "drizzle-orm";
import type { Client } from "@libsql/client";
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
  deliveryProofs,
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
import {
  registerProductsFromOrder,
  resolveOrderItemCatalog,
} from "@/lib/services/products";
import { getLearnedUnitForItem } from "@/lib/services/product-learning";
import { validateTruckForOrder } from "@/lib/dispatch/validate-assignment";
import { normalizeScannedInvoiceNumber } from "@/lib/invoices/scan-utils";
import {
  isOrderReadyToShip,
  normalizeDeliveryTimePreference,
  validateRequestedDeliveryDate,
  DELIVERY_TIME_PREFERENCE_LABELS,
  matchesWorkDay,
  todayDateString,
  type WorkDayFilter,
} from "@/lib/delivery-schedule";
import {
  getOrderLoadStatus,
  syncTruckDriverOnAssignments,
} from "@/lib/services/load-coordination";
import {
  resolveAssignmentDeliveryRound,
  clearVehicleReturningIfPrepping,
} from "@/lib/services/truck-workspace";
import {
  computeOrderDisplayStage,
  ORDER_STAGE_LABELS,
} from "@/lib/order-display";
import {
  calculateOrderTotals,
  calculateTileLine,
  calculateWeightLine,
  enrichOrderItem,
  checkVehicleCapacity,
  formatM2,
  tileSpecOptionsForItem,
  type OrderItemInput,
} from "@/lib/calculations";
import { MAX_DELIVERY_ROUNDS, normalizeOrderUnit, type OrderStatus, type EmployeeRole } from "@/lib/constants";
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
  unit: import("@/lib/constants").OrderUnit | string;
  productId?: number;
  productName?: string;
  productEan?: string;
  tileWidthCm?: number;
  tileHeightCm?: number;
  tileThicknessCm?: number;
  quantityM2?: number;
  weightKg?: number;
  lengthM?: number;
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
  customerHasForklift?: boolean;
  /** Manual dispatch hint — smart dispatch puts this order on this truck when set. */
  preferredTruckId?: number | null;
  salesEmployeeId?: number | null;
  salesAgentName?: string | null;
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

function enrichItems(items: OrderItemInput[]) {
  return items.map((item) => {
    const enriched = enrichOrderItem(item);
    return {
      unit: enriched.unit,
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
      lengthM: enriched.lengthM,
    };
  });
}

async function itemsWithCatalog(
  items: OrderItemPayload[]
): Promise<OrderItemInput[]> {
  return Promise.all(
    items.map(async (item) => {
      const learnedUnit = await getLearnedUnitForItem(item);
      const withLearned =
        learnedUnit && !item.unit ? { ...item, unit: learnedUnit } : item;
      return {
        ...withLearned,
        catalogPallet: await resolveOrderItemCatalog(withLearned),
      };
    })
  );
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
  /** When no vehicleId: show orders assigned on deliveryRound across all trucks */
  fleetRoundFilter?: boolean;
  /** When vehicleId set: workspace = on truck + unassigned; on_truck; unassigned */
  vehicleScope?: "workspace" | "on_truck" | "unassigned";
  status?: string;
  search?: string;
  hideDelivered?: boolean;
  readyToShip?: boolean;
  shipAsOfDate?: string;
  workDay?: WorkDayFilter;
  salesEmployeeId?: number;
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
  if (filters?.salesEmployeeId != null) {
    conditions.push(eq(orders.salesEmployeeId, filters.salesEmployeeId));
  }
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
  } else if (
    filters?.fleetRoundFilter &&
    filters.deliveryRound != null
  ) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM assignments a WHERE a.order_id = ${orders.id} AND a.delivery_round = ${filters.deliveryRound})`
    );
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

  const linkMap = await (
    await import("@/lib/services/order-delivery-links")
  ).getDeliveryLinksByOrderIds(rows.map((row) => row.id));

  const mapped = await Promise.all(
    rows.map(async (order) => {
      try {
        const proofs = await listDeliveryProofs(order.id);
        const deliveryStage = computeOrderDisplayStage(
          order.status,
          proofs.map((p) => p.phase)
        );
        return {
          ...order,
          customerHasForklift: Boolean(order.customerHasForklift),
          assignment: await getOrderAssignment(order.id),
          staff: await getOrderStaff(order.id),
          proofs,
          deliveryStage,
          deliveryStageLabel: ORDER_STAGE_LABELS[deliveryStage],
          ...(await getOrderLoadStatus(order.id)),
          deliveryLinks: linkMap.get(order.id) ?? [],
          items: await dbAll(
            db
              .select()
              .from(orderItems)
              .where(eq(orderItems.orderId, order.id))
          ),
        };
      } catch (err) {
        console.error("[listOrders] enrich failed for order", order.id, err);
        const deliveryStage = computeOrderDisplayStage(order.status, []);
        return {
          ...order,
          assignment: null,
          staff: { staff: [], picker: null, driver: null },
          proofs: [],
          deliveryStage,
          deliveryStageLabel: ORDER_STAGE_LABELS[deliveryStage],
          prepStatus: "pending" as const,
          loadStatus: "pending" as const,
          loadNotes: null,
          canMarkLoaded: false,
          loadBlockedReason: null,
          deliveryLinks: linkMap.get(order.id) ?? [],
          items: [],
        };
      }
    })
  );

  return dedupeOrdersByInvoiceNumber(
    mapped.filter((order) => {
    if (filters?.readyToShip && !isOrderReadyToShip(order, filters.shipAsOfDate)) {
      return false;
    }
    if (
      filters?.workDay &&
      filters.workDay !== "all" &&
      !matchesWorkDay(order, filters.workDay, filters.shipAsOfDate)
    ) {
      return false;
    }
    if (!filters?.hideDelivered) return true;
    return order.deliveryStage !== "delivered";
    })
  );
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
    customerHasForklift: Boolean(order.customerHasForklift),
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
    deliveryLinks: await (
      await import("@/lib/services/order-delivery-links")
    ).listLinkedOrders(id),
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

export function normalizeStoredInvoiceNumber(invoiceNumber: string): string {
  return normalizeScannedInvoiceNumber(invoiceNumber);
}

export function dedupeOrdersByInvoiceNumber<
  T extends { id: number; invoiceNumber: string },
>(orderRows: T[]): T[] {
  const byInvoice = new Map<string, T>();
  const withoutInvoice: T[] = [];

  for (const order of orderRows) {
    const key = normalizeStoredInvoiceNumber(order.invoiceNumber);
    if (!key) {
      withoutInvoice.push(order);
      continue;
    }
    const existing = byInvoice.get(key);
    if (!existing || order.id > existing.id) {
      byInvoice.set(key, order);
    }
  }

  return [...byInvoice.values(), ...withoutInvoice].sort((a, b) => b.id - a.id);
}

export async function findOrderByInvoiceNumber(invoiceNumber: string) {
  const normalized = normalizeStoredInvoiceNumber(invoiceNumber);
  if (!normalized) return null;

  const db = await getDb();
  const exact = await dbOne(
    db
      .select({ id: orders.id, invoiceNumber: orders.invoiceNumber })
      .from(orders)
      .where(eq(orders.invoiceNumber, normalized))
  );
  if (exact) return exact;

  const rows = await dbAll(
    db.select({ id: orders.id, invoiceNumber: orders.invoiceNumber }).from(orders)
  );

  for (const row of rows) {
    if (normalizeStoredInvoiceNumber(row.invoiceNumber) === normalized) {
      return row;
    }
  }
  return null;
}

export async function getOrderByInvoiceNumber(invoiceNumber: string) {
  const existing = await findOrderByInvoiceNumber(invoiceNumber);
  if (!existing) return null;
  return getOrder(existing.id);
}

async function assertUniqueInvoiceNumber(
  invoiceNumber: string,
  excludeOrderId?: number
) {
  const existing = await findOrderByInvoiceNumber(invoiceNumber);
  if (existing && existing.id !== excludeOrderId) {
    throw new Error(
      `Invoice ${normalizeStoredInvoiceNumber(invoiceNumber)} already exists (order #${existing.id})`
    );
  }
}

async function mergeDuplicateOrderInto(keeperId: number, duplicateId: number) {
  if (keeperId === duplicateId) return;

  const db = await getDb();
  const keeper = await getOrder(keeperId);
  const duplicate = await getOrder(duplicateId);
  if (!keeper || !duplicate) return;

  const keeperStaff = await getOrderStaff(keeperId);
  const sameContent =
    keeper.totalM2 === duplicate.totalM2 &&
    keeper.price === duplicate.price &&
    keeper.items.length === duplicate.items.length;

  if (!sameContent && duplicate.items.length > 0) {
    await appendOrderItems(
      keeperId,
      duplicate.items.map((item) => mapStoredItemToPayload(item)),
      {
        addPrice: duplicate.price,
        notesAppend: duplicate.notes ?? undefined,
      }
    );
  }

  if (!keeper.assignment && duplicate.assignment) {
    await db
      .update(assignments)
      .set({ orderId: keeperId })
      .where(eq(assignments.orderId, duplicateId));
  }

  const duplicateStaff = await dbAll(
    db
      .select()
      .from(orderEmployeeAssignments)
      .where(eq(orderEmployeeAssignments.orderId, duplicateId))
  );
  for (const row of duplicateStaff) {
    const keeperHasSameRole = keeperStaff.staff.some((s) => s.role === row.role);
    const keeperHasSamePerson = keeperStaff.staff.some(
      (s) => s.role === row.role && s.employeeId === row.employeeId
    );
    if (!keeperHasSameRole && !keeperHasSamePerson) {
      await db
        .update(orderEmployeeAssignments)
        .set({ orderId: keeperId })
        .where(eq(orderEmployeeAssignments.id, row.id));
    }
  }

  await db
    .update(deliveryProofs)
    .set({ orderId: keeperId })
    .where(eq(deliveryProofs.orderId, duplicateId));

  await db
    .update(orders)
    .set({
      invoiceNumber: normalizeStoredInvoiceNumber(keeper.invoiceNumber),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(orders.id, keeperId));

  await deleteOrder(duplicateId);
}

let backfillUniqueInvoiceNumbersPromise: Promise<void> | null = null;

/** Normalize invoice numbers, merge duplicates, and enforce DB uniqueness. */
export async function backfillUniqueInvoiceNumbers(client?: Client) {
  if (!backfillUniqueInvoiceNumbersPromise) {
    backfillUniqueInvoiceNumbersPromise = (async () => {
      const db = await getDb();
      const rows = await dbAll(
        db
          .select({ id: orders.id, invoiceNumber: orders.invoiceNumber })
          .from(orders)
          .orderBy(orders.id)
      );

      const groups = new Map<string, number[]>();
      for (const row of rows) {
        const key = normalizeStoredInvoiceNumber(row.invoiceNumber);
        if (!key) continue;
        const ids = groups.get(key) ?? [];
        ids.push(row.id);
        groups.set(key, ids);
      }

      let merged = 0;
      for (const ids of groups.values()) {
        if (ids.length <= 1) {
          const [onlyId] = ids;
          const row = rows.find((entry) => entry.id === onlyId);
          if (!row) continue;
          const normalized = normalizeStoredInvoiceNumber(row.invoiceNumber);
          if (normalized !== row.invoiceNumber) {
            await db
              .update(orders)
              .set({ invoiceNumber: normalized })
              .where(eq(orders.id, onlyId));
          }
          continue;
        }

        const sorted = [...ids].sort((a, b) => b - a);
        const keeperId = sorted[0]!;
        for (const duplicateId of sorted.slice(1)) {
          await mergeDuplicateOrderInto(keeperId, duplicateId);
          merged += 1;
        }
      }

      if (client) {
        await client.execute(
          "CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_invoice_number_unique ON orders(invoice_number)"
        );
      }

      if (merged > 0) {
        console.log(
          `[backfillUniqueInvoiceNumbers] merged ${merged} duplicate order(s) by invoice number`
        );
      }
    })().catch((err) => {
      backfillUniqueInvoiceNumbersPromise = null;
      throw err;
    });
  }

  return backfillUniqueInvoiceNumbersPromise;
}

export async function createOrder(
  payload: OrderPayload,
  options?: { importQueueId?: number }
) {
  const db = await getDb();
  const now = new Date().toISOString();
  const orderDate = payload.orderDate?.trim() || todayDateString();
  const requestedDeliveryDate = payload.requestedDeliveryDate?.trim() || null;
  const deliveryTimePreference = normalizeDeliveryTimePreference(
    payload.deliveryTimePreference
  );
  const scheduleError = validateRequestedDeliveryDate(
    orderDate,
    requestedDeliveryDate
  );
  if (scheduleError) {
    throw new Error(scheduleError);
  }

  const invoiceNumber = normalizeStoredInvoiceNumber(payload.invoiceNumber);
  if (!invoiceNumber) {
    throw new Error("Invoice number is required");
  }
  await assertUniqueInvoiceNumber(invoiceNumber);

  const itemsInput = await itemsWithCatalog(payload.items);
  const totals = calculateOrderTotals(itemsInput);
  const enriched = enrichItems(itemsInput);
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
        invoiceNumber,
        customerName: payload.customerName,
        location: locFields.location,
        locationId: locFields.locationId,
        region: locFields.region,
        city: locFields.city,
        lat: locFields.lat,
        lng: locFields.lng,
        price: payload.price,
        orderDate,
        requestedDeliveryDate,
        deliveryTimePreference,
        status: payload.status ?? "pending",
        totalM2: totals.totalM2,
        totalPieces: totals.totalPieces,
        totalPallets: totals.totalPallets,
        totalWeightKg: totals.totalWeightKg,
        notes: payload.notes ?? null,
        priority: payload.priority ?? "normal",
        customerHasForklift: payload.customerHasForklift ? 1 : 0,
        preferredTruckId: payload.preferredTruckId ?? null,
        salesEmployeeId: payload.salesEmployeeId ?? null,
        salesAgentName: payload.salesAgentName ?? null,
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
      invoiceNumber,
      customerName: payload.customerName,
      location: payload.location,
      totalM2: totals.totalM2,
      totalPallets: totals.totalPallets,
      totalPieces: totals.totalPieces,
    }),
    {
      category: "orders",
      details: {
        invoiceNumber,
        location: payload.location,
        totals,
      },
    }
  );

  try {
    const { linkImportQueueToOrder } = await import(
      "@/lib/services/invoice-import-queue"
    );
    await linkImportQueueToOrder({
      orderId,
      invoiceNumber,
      queueId: options?.importQueueId,
    });
  } catch (err) {
    console.error("[createOrder] import queue link failed", err);
  }

  return getOrder(orderId);
}

function mapStoredItemToPayload(item: {
  unit: string;
  productName: string | null;
  productEan: string | null;
  tileWidthCm: number | null;
  tileHeightCm: number | null;
  tileThicknessCm: number | null;
  quantityM2: number | null;
  weightKg: number | null;
  lengthM: number | null;
  palletCount: number | null;
  pieceCount: number | null;
}): OrderItemPayload {
  const unit = normalizeOrderUnit(item.unit);
  const payload: OrderItemPayload = {
    unit,
    productName: item.productName ?? undefined,
    productEan: item.productEan ?? undefined,
    tileWidthCm: item.tileWidthCm ?? undefined,
    tileHeightCm: item.tileHeightCm ?? undefined,
    tileThicknessCm: item.tileThicknessCm ?? undefined,
    quantityM2: item.quantityM2 ?? undefined,
    weightKg: item.weightKg ?? undefined,
    lengthM: item.lengthM ?? undefined,
  };

  if (unit === "m2") {
    const w = item.tileWidthCm ?? 60;
    const h = item.tileHeightCm ?? 60;
    const m2 = item.quantityM2 ?? 0;
    const specOptions = tileSpecOptionsForItem({
      tileWidthCm: w,
      tileHeightCm: h,
      tileThicknessCm: item.tileThicknessCm ?? undefined,
    });
    const line = calculateTileLine(w, h, m2, specOptions);
    if (
      item.palletCount != null &&
      item.palletCount !== line.calculatedPallets
    ) {
      payload.manualPallets = item.palletCount;
    }
    if (item.pieceCount != null && item.pieceCount !== line.calculatedPieces) {
      payload.manualPieces = item.pieceCount;
    }
  } else if (unit === "kg") {
    const weightLine = calculateWeightLine(
      item.weightKg ?? 0,
      item.productName ?? ""
    );
    if (
      item.pieceCount != null &&
      item.pieceCount !== weightLine.calculatedPieces
    ) {
      payload.manualPieces = item.pieceCount;
    }
  } else if (unit !== "meter" && item.pieceCount != null) {
    payload.manualPieces = item.pieceCount;
  }

  return payload;
}

/** Add imported line items to an existing order (same invoice number). */
export async function appendOrderItems(
  orderId: number,
  newItems: OrderItemPayload[],
  options?: { addPrice?: number; notesAppend?: string }
) {
  const existing = await getOrder(orderId);
  if (!existing) {
    throw new Error("Order not found");
  }

  const combinedItems: OrderItemPayload[] = [
    ...existing.items.map((item) => mapStoredItemToPayload(item)),
    ...newItems,
  ];

  const addPrice = options?.addPrice ?? 0;
  const notes = [existing.notes, options?.notesAppend]
    .filter(Boolean)
    .join(" · ");

  return updateOrder(orderId, {
    invoiceNumber: existing.invoiceNumber,
    customerName: existing.customerName,
    location: existing.location,
    locationId: existing.locationId ?? undefined,
    region: existing.region ?? undefined,
    city: existing.city ?? undefined,
    lat: existing.lat ?? undefined,
    lng: existing.lng ?? undefined,
    price: existing.price + addPrice,
    orderDate: existing.orderDate,
    requestedDeliveryDate: existing.requestedDeliveryDate,
    deliveryTimePreference: existing.deliveryTimePreference ?? undefined,
    status: existing.status,
    notes: notes || undefined,
    priority: (existing.priority as "normal" | "urgent") ?? "normal",
    items: combinedItems,
  });
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

  const invoiceNumber = normalizeStoredInvoiceNumber(payload.invoiceNumber);
  if (!invoiceNumber) {
    throw new Error("Invoice number is required");
  }
  await assertUniqueInvoiceNumber(invoiceNumber, id);

  const itemsInput = await itemsWithCatalog(payload.items);
  const totals = calculateOrderTotals(itemsInput);
  const enriched = enrichItems(itemsInput);
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
      invoiceNumber,
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
      customerHasForklift: payload.customerHasForklift ? 1 : 0,
      preferredTruckId:
        payload.preferredTruckId === undefined
          ? existing.preferredTruckId
          : payload.preferredTruckId,
      salesEmployeeId: payload.salesEmployeeId ?? existing.salesEmployeeId,
      salesAgentName: payload.salesAgentName ?? existing.salesAgentName,
      updatedAt: now,
    })
    .where(eq(orders.id, id));

  await db.delete(orderItems).where(eq(orderItems.orderId, id));
  for (const item of enriched) {
    await db.insert(orderItems).values({ orderId: id, ...item });
  }

  const changes: string[] = [];
  if (existing.invoiceNumber !== invoiceNumber) {
    changes.push(`invoice ${existing.invoiceNumber} → ${invoiceNumber}`);
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
    orderUpdatedMessage(invoiceNumber, changes),
    {
      category: "orders",
      details: {
        invoiceNumber,
        changes,
        totals,
      },
    }
  );
  await registerProductsFromOrder(id);
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

type AssignmentCapacityTotals = {
  totalM2: number;
  totalPieces: number;
  totalPallets: number;
  totalWeightKg: number;
};

type AssignOrderToVehicleOptions = {
  explicitRound?: boolean;
  ignoreLinkedWarning?: boolean;
  preloadedOrder?: AssignmentCapacityTotals & {
    id: number;
    invoiceNumber: string;
    status: string;
    customerHasForklift?: boolean;
    totalPieces?: number;
    items?: Array<{
      productType?: string | null;
      tileWidthCm?: number | null;
      tileHeightCm?: number | null;
      quantity?: number | null;
      calculatedPieces?: number | null;
    }>;
  };
  preloadedVehicle?: typeof vehicles.$inferSelect;
  preloadedDriverId?: number | null;
  preloadedDriverName?: string | null;
  runningVehicleTotals?: AssignmentCapacityTotals[];
  skipSyncTruckDriver?: boolean;
  skipClearVehicleReturning?: boolean;
  skipReturnOrder?: boolean;
  skipLinkedSplitReminder?: boolean;
  skipCraneValidation?: boolean;
  skipLinkedConflictCheck?: boolean;
};

export async function assignOrderToVehicle(
  orderId: number,
  vehicleId: number,
  deliveryRound: number,
  ignoreWeightWarning = false,
  ignoreCraneRule = false,
  options?: AssignOrderToVehicleOptions
) {
  const ignoreLinkedWarning = options?.ignoreLinkedWarning ?? false;
  const vehiclesToSync = new Set<number>();
  let round = deliveryRound;
  let roundReason: string | undefined;
  if (options?.explicitRound === false) {
    const resolved = await resolveAssignmentDeliveryRound(vehicleId);
    round = resolved.round;
    roundReason = resolved.reason;
  }

  if (round < 1 || round > MAX_DELIVERY_ROUNDS) {
    return {
      ok: false,
      error: `Delivery round must be between 1 and ${MAX_DELIVERY_ROUNDS}`,
    };
  }

  const db = await getDb();
  const order =
    options?.preloadedOrder ?? (await getOrder(orderId));
  if (!order) return { ok: false, error: "Order not found" };

  let craneCheck:
    | { ok: true; warning?: string }
    | { ok: false; error: string; requiresCrane?: true };
  if (options?.skipCraneValidation) {
    craneCheck = { ok: true };
  } else {
    craneCheck = await validateTruckForOrder(orderId, vehicleId, {
      ignoreCraneRule,
      preloadedOrder: order,
      preloadedVehicle: options?.preloadedVehicle,
    });
  }
  if (!craneCheck.ok) {
    return {
      ok: false as const,
      error: craneCheck.error,
      requiresCrane: craneCheck.requiresCrane,
    };
  }

  const { getLinkedTruckConflictMessage, getLinkedSplitReminder } = await import(
    "@/lib/services/order-delivery-links"
  );
  if (!options?.skipLinkedConflictCheck) {
    const linkedConflict = await getLinkedTruckConflictMessage(orderId, vehicleId);
    if (linkedConflict && !ignoreLinkedWarning) {
      return {
        ok: false as const,
        isLinkedWarning: true,
        error: linkedConflict,
      };
    }
  }

  const vehicle =
    options?.preloadedVehicle ??
    (await dbOne(
      db.select().from(vehicles).where(eq(vehicles.id, vehicleId))
    ));
  if (!vehicle) return { ok: false, error: "Vehicle not found" };

  const driverEmployeeId =
    options?.preloadedDriverId !== undefined
      ? options.preloadedDriverId
      : ((await getDriverForVehicle(vehicleId))?.id ?? null);

  const existingTotals =
    options?.runningVehicleTotals ??
    (
      await dbAll(
        db
          .select({ order: orders })
          .from(assignments)
          .innerJoin(orders, eq(assignments.orderId, orders.id))
          .where(
            and(
              eq(assignments.vehicleId, vehicleId),
              eq(assignments.deliveryRound, round),
              sql`${assignments.orderId} != ${orderId}`
            )
          )
      )
    ).map((r) => ({
      totalM2: r.order.totalM2,
      totalPieces: r.order.totalPieces,
      totalPallets: r.order.totalPallets,
      totalWeightKg: r.order.totalWeightKg,
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
          deliveryRound: round,
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
    if (options?.skipSyncTruckDriver) {
      vehiclesToSync.add(prev.vehicleId);
    } else {
      await syncTruckDriverOnAssignments(prev.vehicleId);
    }
  }

  await db.insert(assignments).values({
    orderId,
    vehicleId,
    driverEmployeeId,
    deliveryRound: round,
    assignedAt: now,
  });

  if (driverEmployeeId) {
    await assignEmployeeToOrder(orderId, driverEmployeeId, "driver");
  }

  if (options?.skipSyncTruckDriver) {
    vehiclesToSync.add(vehicleId);
  } else {
    await syncTruckDriverOnAssignments(vehicleId);
  }

  if (!options?.skipClearVehicleReturning) {
    await clearVehicleReturningIfPrepping(vehicleId);
  }

  if (options?.runningVehicleTotals) {
    options.runningVehicleTotals.push(newTotals);
  }

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
      round,
      !capacity.weightOk && ignoreWeightWarning,
      staff.picker?.employeeName,
      staff.driver?.employeeName ?? options?.preloadedDriverName ?? null
    ),
    {
      category: "deliveries",
      details: {
        invoiceNumber: order.invoiceNumber,
        vehicleId,
        vehicleName: vehicle.name,
        plateNumber: vehicle.plateNumber,
        deliveryRound: round,
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
    linkedWarning: options?.skipLinkedSplitReminder
      ? undefined
      : await getLinkedSplitReminder(orderId),
    deliveryRound: round,
    deliveryRoundReason: roundReason,
    order: options?.skipReturnOrder ? undefined : await getOrder(orderId),
    vehiclesToSync:
      options?.skipSyncTruckDriver ? [...vehiclesToSync] : undefined,
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
    ["prepared", "loaded", "load_skipped", "departed", "arrived", "delivered"].includes(
      p.phase
    )
  );
}

async function checkAssignmentChangePermission(
  order: NonNullable<Awaited<ReturnType<typeof getOrder>>>,
  options?: { force?: boolean; adminPin?: string; skipCheck?: boolean }
): Promise<
  | { ok: true }
  | { ok: false; error: string; requiresPin?: true; requiresForce?: true }
> {
  if (options?.skipCheck) return { ok: true };
  if (!orderHasDeliveryProgress(order)) return { ok: true };

  if (options?.adminPin) {
    const pin = await assertAdminPin(options.adminPin);
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

  const permission = await checkAssignmentChangePermission(order, options);
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
  const pin = await assertAdminPin(options.adminPin);
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

function scheduleAssignmentWarning(order: {
  requestedDeliveryDate?: string | null;
  deliveryTimePreference?: string | null;
}): string | undefined {
  if (order.requestedDeliveryDate && !isOrderReadyToShip(order)) {
    return `Requested delivery ${order.requestedDeliveryDate}. Do not ship before that date.`;
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
  ignoreLinkedWarning?: boolean;
  explicitDeliveryRound?: boolean;
  bulk?: {
    preloadedOrder?: AssignOrderToVehicleOptions["preloadedOrder"];
    preloadedVehicle?: typeof vehicles.$inferSelect;
    preloadedDriverId?: number | null;
    preloadedDriverName?: string | null;
    runningVehicleTotals?: AssignmentCapacityTotals[];
    skipSyncTruckDriver?: boolean;
    skipClearVehicleReturning?: boolean;
    resolvedPickerId?: number | null;
    skipPickerResolution?: boolean;
    skipFinalGetOrder?: boolean;
    skipCraneValidation?: boolean;
    skipLinkedConflictCheck?: boolean;
  };
}) {
  const bulk = input.bulk;
  const truck = await assignOrderToVehicle(
    input.orderId,
    input.vehicleId,
    input.deliveryRound,
    input.ignoreWeightWarning ?? false,
    input.ignoreCraneRule ?? false,
    {
      explicitRound: input.explicitDeliveryRound === false ? false : true,
      ignoreLinkedWarning: input.ignoreLinkedWarning ?? false,
      preloadedOrder: bulk?.preloadedOrder,
      preloadedVehicle: bulk?.preloadedVehicle,
      preloadedDriverId: bulk?.preloadedDriverId,
      preloadedDriverName: bulk?.preloadedDriverName,
      runningVehicleTotals: bulk?.runningVehicleTotals,
      skipSyncTruckDriver: bulk?.skipSyncTruckDriver,
      skipClearVehicleReturning: bulk?.skipClearVehicleReturning,
      skipReturnOrder: bulk?.skipFinalGetOrder,
      skipLinkedSplitReminder: true,
      skipCraneValidation: bulk?.skipCraneValidation,
      skipLinkedConflictCheck: bulk?.skipLinkedConflictCheck,
    }
  );
  if (!truck.ok) return truck;

  const usedRound = truck.deliveryRound ?? input.deliveryRound;

  let pickerId = input.pickerId ?? null;

  if (!bulk?.skipPickerResolution) {
    const { enforceTruckPicker, resolvePickerForTruck } = await import(
      "@/lib/dispatch/picker-resolution"
    );
    pickerId = await enforceTruckPicker(
      input.vehicleId,
      usedRound,
      pickerId
    );
    if (pickerId == null && input.autoAssignTeam !== false) {
      const resolved = await resolvePickerForTruck(input.vehicleId, usedRound, {
        orderCount: 1,
      });
      pickerId = resolved.id;
    }
  } else {
    pickerId = bulk.resolvedPickerId ?? pickerId;
  }

  if (pickerId) {
    if (input.autoAssignTeam !== false) {
      await autoAssignPickerTeam(input.orderId, pickerId);
    } else {
      await assignEmployeeToOrder(input.orderId, pickerId, "picker");
    }
  }

  const db = await getDb();
  const order =
    bulk?.preloadedOrder ??
    (bulk?.skipFinalGetOrder
      ? await dbOne(db.select().from(orders).where(eq(orders.id, input.orderId)))
      : await getOrder(input.orderId));
  if (!order) {
    return { ok: false as const, error: "Order not found" };
  }
  const vehicle =
    bulk?.preloadedVehicle ??
    (await dbOne(
      db
        .select({ name: vehicles.name })
        .from(vehicles)
        .where(eq(vehicles.id, input.vehicleId))
    ));

  await logActivity(
    "assign_bundle",
    "order",
    input.orderId,
    orderAssignBundleMessage(
      order.invoiceNumber,
      vehicle?.name ?? "truck",
      undefined
    ),
    {
      category: "deliveries",
      details: {
        invoiceNumber: order.invoiceNumber,
        vehicleId: input.vehicleId,
        deliveryRound: usedRound,
        pickerId,
        summary: orderAssignBundleMessage(
          order.invoiceNumber,
          vehicle?.name ?? "truck",
          undefined
        ),
      },
    }
  );

  return {
    ok: true as const,
    order: bulk?.skipFinalGetOrder ? undefined : await getOrder(input.orderId),
    craneWarning: truck.craneWarning,
    scheduleWarning: bulk?.skipFinalGetOrder
      ? undefined
      : scheduleAssignmentWarning({
          requestedDeliveryDate:
            "requestedDeliveryDate" in order
              ? order.requestedDeliveryDate
              : undefined,
          deliveryTimePreference:
            "deliveryTimePreference" in order
              ? order.deliveryTimePreference
              : undefined,
        }),
    linkedWarning: truck.linkedWarning,
    deliveryRound: usedRound,
    deliveryRoundReason: truck.deliveryRoundReason,
    vehiclesToSync: truck.vehiclesToSync,
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
    const directIds = (
      await dbAll(
        db
          .select({ orderId: orderEmployeeAssignments.orderId })
          .from(orderEmployeeAssignments)
          .where(eq(orderEmployeeAssignments.employeeId, employeeId))
      )
    ).map((r) => r.orderId);

    let truckOrderIds: number[] = [];
    if (directIds.length > 0) {
      const truckSlots = await dbAll(
        db
          .selectDistinct({
            vehicleId: assignments.vehicleId,
            deliveryRound: assignments.deliveryRound,
          })
          .from(assignments)
          .where(inArray(assignments.orderId, directIds))
      );

      if (truckSlots.length > 0) {
        truckOrderIds = (
          await dbAll(
            db
              .select({ orderId: assignments.orderId })
              .from(assignments)
              .where(
                or(
                  ...truckSlots.map((slot) =>
                    and(
                      eq(assignments.vehicleId, slot.vehicleId),
                      eq(assignments.deliveryRound, slot.deliveryRound)
                    )
                  )
                )
              )
          )
        ).map((r) => r.orderId);
      }
    }

    ids = [...new Set([...directIds, ...truckOrderIds])];
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
  ignoreCraneRule = false,
  pickerId?: number | null
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
      pickerId: pickerId ?? null,
      autoAssignTeam: pickerId == null,
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

/** Move unfinished orders to another delivery day (warehouse work bucket). */
export async function bulkRescheduleOrders(input: {
  orderIds: number[];
  requestedDeliveryDate: string;
}) {
  const date = input.requestedDeliveryDate.trim();
  if (!date) {
    return { ok: false as const, error: "Delivery date is required" };
  }

  const db = await getDb();
  const now = new Date().toISOString();
  let updated = 0;
  const skipped: number[] = [];

  for (const orderId of input.orderIds) {
    const order = await getOrder(orderId);
    if (!order) {
      skipped.push(orderId);
      continue;
    }
    if (order.deliveryStage === "delivered" || order.status === "cancelled") {
      skipped.push(orderId);
      continue;
    }
    const dateError = validateRequestedDeliveryDate(order.orderDate, date);
    if (dateError) {
      return { ok: false as const, error: `${order.invoiceNumber}: ${dateError}` };
    }

    await db
      .update(orders)
      .set({ requestedDeliveryDate: date, updatedAt: now })
      .where(eq(orders.id, orderId));

    await logActivity(
      "update",
      "order",
      orderId,
      `Rescheduled ${order.invoiceNumber} to ${date}`,
      {
        category: "orders",
        details: {
          requestedDeliveryDate: date,
          previousRequestedDeliveryDate: order.requestedDeliveryDate ?? null,
        },
      }
    );
    updated += 1;
  }

  return { ok: true as const, updated, skipped };
}

/** Move one or more orders to another truck (e.g. breakdown). Keeps picker by default. */
export async function transferOrdersToVehicle(input: {
  orderIds: number[];
  vehicleId: number;
  deliveryRound: number;
  pickerId?: number | null;
  preservePicker?: boolean;
  ignoreWeightWarning?: boolean;
  ignoreCraneRule?: boolean;
  ignoreLinkedWarning?: boolean;
}) {
  const db = await getDb();
  const uniqueOrderIds = [...new Set(input.orderIds)];
  const vehicle = await dbOne(
    db.select().from(vehicles).where(eq(vehicles.id, input.vehicleId))
  );
  if (!vehicle) {
    return { ok: false as const, error: "Vehicle not found", results: [] };
  }

  if (!input.ignoreLinkedWarning) {
    const { getBulkLinkedConflictMessage } = await import(
      "@/lib/services/order-delivery-links"
    );
    const linkedMessage = await getBulkLinkedConflictMessage(
      uniqueOrderIds,
      input.vehicleId
    );
    if (linkedMessage) {
      return {
        ok: false as const,
        isLinkedWarning: true,
        error: linkedMessage,
        results: [],
      };
    }
  }

  const deliveryRound = input.deliveryRound;
  if (deliveryRound < 1 || deliveryRound > MAX_DELIVERY_ROUNDS) {
    return {
      ok: false as const,
      error: `Delivery round must be between 1 and ${MAX_DELIVERY_ROUNDS}`,
      results: [],
    };
  }

  const orderRows = uniqueOrderIds.length
    ? await dbAll(
        db.select().from(orders).where(inArray(orders.id, uniqueOrderIds))
      )
    : [];
  const orderById = new Map(orderRows.map((order) => [order.id, order]));

  const itemRows = uniqueOrderIds.length
    ? await dbAll(
        db
          .select()
          .from(orderItems)
          .where(inArray(orderItems.orderId, uniqueOrderIds))
      )
    : [];
  const itemsByOrderId = new Map<number, typeof itemRows>();
  for (const item of itemRows) {
    const list = itemsByOrderId.get(item.orderId) ?? [];
    list.push(item);
    itemsByOrderId.set(item.orderId, list);
  }

  const pickerRows = uniqueOrderIds.length
    ? await dbAll(
        db
          .select({
            orderId: orderEmployeeAssignments.orderId,
            employeeId: orderEmployeeAssignments.employeeId,
          })
          .from(orderEmployeeAssignments)
          .where(
            and(
              inArray(orderEmployeeAssignments.orderId, uniqueOrderIds),
              eq(orderEmployeeAssignments.role, "picker")
            )
          )
      )
    : [];
  const pickerByOrderId = new Map(
    pickerRows.map((row) => [row.orderId, row.employeeId])
  );

  const assignmentRows = uniqueOrderIds.length
    ? await dbAll(
        db
          .select({
            orderId: assignments.orderId,
            vehicleName: vehicles.name,
          })
          .from(assignments)
          .innerJoin(vehicles, eq(assignments.vehicleId, vehicles.id))
          .where(inArray(assignments.orderId, uniqueOrderIds))
      )
    : [];
  const assignmentByOrderId = new Map(
    assignmentRows.map((row) => [row.orderId, row.vehicleName])
  );

  const vehicleLoad = await getVehicleLoad(input.vehicleId, deliveryRound);
  const runningVehicleTotals = vehicleLoad.assignedOrders
    .filter((order) => !uniqueOrderIds.includes(order.id))
    .map((order) => ({
      totalM2: order.totalM2,
      totalPieces: order.totalPieces,
      totalPallets: order.totalPallets,
      totalWeightKg: order.totalWeightKg,
    }));

  const linkedDriver = await getDriverForVehicle(input.vehicleId);
  const driverEmployeeId = linkedDriver?.id ?? null;

  const { enforceTruckPicker, resolvePickerForTruck } = await import(
    "@/lib/dispatch/picker-resolution"
  );
  let resolvedPickerId = input.pickerId ?? null;
  resolvedPickerId = await enforceTruckPicker(
    input.vehicleId,
    deliveryRound,
    resolvedPickerId
  );
  if (resolvedPickerId == null) {
    const resolved = await resolvePickerForTruck(
      input.vehicleId,
      deliveryRound,
      { orderCount: uniqueOrderIds.length }
    );
    resolvedPickerId = resolved.id;
  }

  const { getLinkedTruckConflictMessage } = await import(
    "@/lib/services/order-delivery-links"
  );

  const results: Array<{
    orderId: number;
    ok: boolean;
    error?: string;
    requiresCrane?: boolean;
    isWeightWarning?: boolean;
    isLinkedWarning?: boolean;
    invoiceNumber?: string;
  }> = [];
  const vehiclesToSync = new Set<number>();

  for (const orderId of uniqueOrderIds) {
    const order = orderById.get(orderId);
    if (!order) {
      results.push({ orderId, ok: false, error: "Order not found" });
      continue;
    }

    const preloadedOrder = {
      ...order,
      customerHasForklift: Boolean(order.customerHasForklift),
      items: itemsByOrderId.get(orderId) ?? [],
    };

    if (order.status === "delivered" || order.status === "cancelled") {
      results.push({
        orderId,
        ok: false,
        error: `Cannot transfer ${order.status} order`,
        invoiceNumber: order.invoiceNumber,
      });
      continue;
    }

    const craneCheck = await validateTruckForOrder(orderId, input.vehicleId, {
      ignoreCraneRule: input.ignoreCraneRule ?? false,
      preloadedOrder,
      preloadedVehicle: vehicle,
    });
    if (!craneCheck.ok) {
      results.push({
        orderId,
        ok: false,
        error: craneCheck.error,
        requiresCrane: craneCheck.requiresCrane,
        invoiceNumber: order.invoiceNumber,
      });
      if (!craneCheck.requiresCrane) {
        break;
      }
      continue;
    }

    if (!input.ignoreLinkedWarning) {
      const linkedConflict = await getLinkedTruckConflictMessage(
        orderId,
        input.vehicleId
      );
      if (linkedConflict) {
        results.push({
          orderId,
          ok: false,
          error: linkedConflict,
          isLinkedWarning: true,
          invoiceNumber: order.invoiceNumber,
        });
        break;
      }
    }

    const fromVehicle = assignmentByOrderId.get(orderId) ?? "previous truck";
    const pickerId =
      input.pickerId != null
        ? input.pickerId
        : input.preservePicker !== false
          ? (pickerByOrderId.get(orderId) ?? resolvedPickerId)
          : resolvedPickerId;

    const result = await assignOrderBundle({
      orderId,
      vehicleId: input.vehicleId,
      deliveryRound,
      pickerId,
      autoAssignTeam: pickerId == null,
      ignoreWeightWarning: input.ignoreWeightWarning ?? false,
      ignoreCraneRule: input.ignoreCraneRule ?? false,
      ignoreLinkedWarning: input.ignoreLinkedWarning ?? false,
      explicitDeliveryRound: true,
      bulk: {
        preloadedOrder,
        preloadedVehicle: vehicle,
        preloadedDriverId: driverEmployeeId,
        preloadedDriverName: linkedDriver?.name ?? null,
        runningVehicleTotals,
        skipSyncTruckDriver: true,
        skipClearVehicleReturning: true,
        resolvedPickerId: pickerId,
        skipPickerResolution: true,
        skipFinalGetOrder: true,
        skipCraneValidation: true,
        skipLinkedConflictCheck: true,
      },
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
        isLinkedWarning:
          "isLinkedWarning" in result ? result.isLinkedWarning : undefined,
        invoiceNumber: order.invoiceNumber,
      });
      if ("isWeightWarning" in result && result.isWeightWarning) {
        break;
      }
      if ("isLinkedWarning" in result && result.isLinkedWarning) {
        break;
      }
      if (!("requiresCrane" in result && result.requiresCrane)) {
        break;
      }
      continue;
    }

    for (const vehicleId of result.vehiclesToSync ?? []) {
      vehiclesToSync.add(vehicleId);
    }
    assignmentByOrderId.set(orderId, vehicle.name);

    await logActivity(
      "transfer",
      "order",
      orderId,
      `${order.invoiceNumber} transferred from ${fromVehicle} to ${vehicle.name} (${vehicle.plateNumber}) — round ${result.deliveryRound ?? deliveryRound}.`,
      {
        category: "deliveries",
        details: {
          invoiceNumber: order.invoiceNumber,
          fromVehicle,
          vehicleId: input.vehicleId,
          vehicleName: vehicle.name,
          deliveryRound: result.deliveryRound ?? deliveryRound,
        },
      }
    );

    results.push({
      orderId,
      ok: true,
      invoiceNumber: order.invoiceNumber,
    });
  }

  for (const vehicleId of vehiclesToSync) {
    await syncTruckDriverOnAssignments(vehicleId);
  }
  if (results.some((result) => result.ok)) {
    await clearVehicleReturningIfPrepping(input.vehicleId);
  }

  const transferred = results.filter((result) => result.ok).length;
  const failed = results.filter((result) => !result.ok);
  return {
    ok: transferred === uniqueOrderIds.length,
    transferred,
    partial: transferred > 0 && transferred < uniqueOrderIds.length,
    results,
    vehicleName: vehicle.name,
    error:
      transferred === uniqueOrderIds.length
        ? undefined
        : failed[0]?.error ??
          (transferred > 0
            ? `Assigned ${transferred} of ${uniqueOrderIds.length} orders`
            : "Transfer failed"),
  };
}

export {
  assignEmployeeToOrder,
  unassignEmployeeFromOrder,
  getOrderStaff,
} from "@/lib/services/employees";
