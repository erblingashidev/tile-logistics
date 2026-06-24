import { eq, and, sql } from "drizzle-orm";
import { assignEmployeeToOrder } from "@/lib/services/employees";
import { getDb } from "@/lib/db";
import { dbAll, dbOne } from "@/lib/db/query";
import {
  assignments,
  deliveryProofs,
  employees,
  orderEmployeeAssignments,
  orders,
  vehicles,
} from "@/lib/db/schema";

async function driverLinkedToVehicle(vehicleId: number) {
  const db = await getDb();
  const rows = await dbAll(
    db
      .select()
      .from(employees)
      .where(eq(employees.assignedVehicleId, vehicleId))
  );
  const driver = rows.find((e) => {
    try {
      const roles = JSON.parse(e.roles) as string[];
      return roles.includes("driver");
    } catch {
      return false;
    }
  });
  if (!driver) return null;
  return { id: driver.id, name: driver.name, status: driver.status };
}

export type OrderLoadStatus = "pending" | "loaded" | "load_skipped";

export interface TruckLoadOrder {
  orderId: number;
  invoiceNumber: string;
  customerName: string;
  loadStatus: OrderLoadStatus;
  loadNotes: string | null;
  /** Loaded on truck but driver has not left warehouse yet. */
  awaitingDepart: boolean;
}

export interface TruckLoadStatus {
  vehicleId: number;
  vehicleName: string;
  plateNumber: string;
  deliveryRound: number;
  orders: TruckLoadOrder[];
  totalOrders: number;
  resolvedCount: number;
  loadedCount: number;
  skippedCount: number;
  pendingCount: number;
  allResolved: boolean;
  canDepart: boolean;
  /** All loaded orders have departed (none waiting to leave). */
  hasFullyDeparted: boolean;
  /** Loaded orders still waiting for driver to leave warehouse. */
  awaitingDepartCount: number;
}

function loadStatusFromProofs(
  proofs: { phase: string; notes: string | null }[]
): { status: OrderLoadStatus; notes: string | null } {
  const loaded = proofs.find((p) => p.phase === "loaded");
  if (loaded) return { status: "loaded", notes: loaded.notes };

  const skipped = proofs.find((p) => p.phase === "load_skipped");
  if (skipped) {
    return { status: "load_skipped", notes: skipped.notes };
  }

  return { status: "pending", notes: null };
}

export async function getOrderLoadStatus(orderId: number): Promise<{
  loadStatus: OrderLoadStatus;
  loadNotes: string | null;
}> {
  const db = await getDb();
  const proofs = await dbAll(
    db
      .select({ phase: deliveryProofs.phase, notes: deliveryProofs.notes })
      .from(deliveryProofs)
      .where(eq(deliveryProofs.orderId, orderId))
  );
  const { status, notes } = loadStatusFromProofs(proofs);
  return { loadStatus: status, loadNotes: notes };
}

/** Backfill driver on truck assignments from employee ↔ truck link. */
export async function syncTruckDriverOnAssignments(vehicleId: number) {
  const driver = await driverLinkedToVehicle(vehicleId);
  if (!driver) return;
  const db = await getDb();
  await db
    .update(assignments)
    .set({ driverEmployeeId: driver.id })
    .where(
      and(
        eq(assignments.vehicleId, vehicleId),
        sql`(driver_employee_id IS NULL OR driver_employee_id != ${driver.id})`
      )
    );

  const orderRows = await dbAll(
    db
      .select({ orderId: assignments.orderId })
      .from(assignments)
      .where(eq(assignments.vehicleId, vehicleId))
  );
  for (const { orderId } of orderRows) {
    await assignEmployeeToOrder(orderId, driver.id, "driver");
  }
}

export async function resolveDriverIdForOrder(
  orderId: number
): Promise<number | null> {
  const assignment = await getTruckAssignmentForOrder(orderId);
  if (!assignment) return null;
  if (assignment.driverEmployeeId) return assignment.driverEmployeeId;
  const linked = await driverLinkedToVehicle(assignment.vehicleId);
  return linked?.id ?? null;
}

export async function isDriverAuthorizedForOrder(
  orderId: number,
  employeeId: number
): Promise<boolean> {
  const assignment = await getTruckAssignmentForOrder(orderId);
  if (!assignment) return false;
  if (assignment.driverEmployeeId === employeeId) return true;
  const linked = await driverLinkedToVehicle(assignment.vehicleId);
  return linked?.id === employeeId;
}

export async function getTruckAssignmentForOrder(orderId: number) {
  const db = await getDb();
  return dbOne(
    db
      .select({
        vehicleId: assignments.vehicleId,
        deliveryRound: assignments.deliveryRound,
        vehicleName: vehicles.name,
        plateNumber: vehicles.plateNumber,
        driverEmployeeId: assignments.driverEmployeeId,
      })
      .from(assignments)
      .innerJoin(vehicles, eq(assignments.vehicleId, vehicles.id))
      .where(eq(assignments.orderId, orderId))
  );
}

/** All orders on the same truck + delivery round. */
export async function getTruckLoadStatus(
  vehicleId: number,
  deliveryRound: number
): Promise<TruckLoadStatus> {
  await syncTruckDriverOnAssignments(vehicleId);
  const db = await getDb();
  const rows = await dbAll(
    db
      .select({
        orderId: orders.id,
        invoiceNumber: orders.invoiceNumber,
        customerName: orders.customerName,
      })
      .from(assignments)
      .innerJoin(orders, eq(assignments.orderId, orders.id))
      .where(
        and(
          eq(assignments.vehicleId, vehicleId),
          eq(assignments.deliveryRound, deliveryRound)
        )
      )
  );

  const vehicle = await dbOne(
    db
      .select({ name: vehicles.name, plateNumber: vehicles.plateNumber })
      .from(vehicles)
      .where(eq(vehicles.id, vehicleId))
  );

  const truckOrders: TruckLoadOrder[] = await Promise.all(
    rows.map(async (row) => {
      const { loadStatus, loadNotes } = await getOrderLoadStatus(row.orderId);
      const awaitingDepart =
        loadStatus === "loaded" && !(await orderHasDeparted(row.orderId));
      return {
        orderId: row.orderId,
        invoiceNumber: row.invoiceNumber,
        customerName: row.customerName,
        loadStatus,
        loadNotes,
        awaitingDepart,
      };
    })
  );

  const resolvedCount = truckOrders.filter(
    (o) => o.loadStatus !== "pending"
  ).length;
  const loadedCount = truckOrders.filter(
    (o) => o.loadStatus === "loaded"
  ).length;
  const skippedCount = truckOrders.filter(
    (o) => o.loadStatus === "load_skipped"
  ).length;
  const pendingCount = truckOrders.filter(
    (o) => o.loadStatus === "pending"
  ).length;
  const allResolved = pendingCount === 0 && truckOrders.length > 0;

  const awaitingDepartCount = truckOrders.filter((o) => o.awaitingDepart).length;
  const hasFullyDeparted =
    loadedCount > 0 && awaitingDepartCount === 0;
  const canDepart = allResolved && awaitingDepartCount > 0;

  return {
    vehicleId,
    vehicleName: vehicle?.name ?? "Truck",
    plateNumber: vehicle?.plateNumber ?? "",
    deliveryRound,
    orders: truckOrders,
    totalOrders: truckOrders.length,
    resolvedCount,
    loadedCount,
    skippedCount,
    pendingCount,
    allResolved,
    canDepart,
    hasFullyDeparted,
    awaitingDepartCount,
  };
}

export async function assertTruckReadyForDriverDeparture(orderId: number): Promise<{
  ok: true;
  truck: TruckLoadStatus;
} | {
  ok: false;
  error: string;
  truck?: TruckLoadStatus;
}> {
  const assignment = await getTruckAssignmentForOrder(orderId);
  if (!assignment) {
    return { ok: false, error: "Order is not assigned to a truck" };
  }

  const truck = await getTruckLoadStatus(
    assignment.vehicleId,
    assignment.deliveryRound
  );

  if (!truck.canDepart) {
    if (truck.hasFullyDeparted) {
      return {
        ok: false,
        error: "All loaded orders on this truck have already left the warehouse",
        truck,
      };
    }
    if (!truck.allResolved) {
    const pending = truck.orders
      .filter((o) => o.loadStatus === "pending")
      .map((o) => o.invoiceNumber)
      .join(", ");
    return {
      ok: false,
      error: `Waiting for loader on: ${pending}. Every order must be marked loaded or “cannot load” with a reason before the driver can leave.`,
      truck,
    };
    }
    if (truck.loadedCount === 0) {
      return {
        ok: false,
        error:
          "No orders were loaded onto this truck. Nothing to deliver.",
        truck,
      };
    }
    return { ok: false, error: "Cannot depart this truck yet", truck };
  }

  return { ok: true, truck };
}

/** Truck groups for a driver (vehicle link + assignment records). */
export async function getDriverTruckGroups(
  driverEmployeeId: number
): Promise<TruckLoadStatus[]> {
  const db = await getDb();
  const keys = new Set<string>();

  const employee = await dbOne(
    db
      .select({ assignedVehicleId: employees.assignedVehicleId })
      .from(employees)
      .where(eq(employees.id, driverEmployeeId))
  );

  const fromDriverColumn = await dbAll(
    db
      .select({
        vehicleId: assignments.vehicleId,
        deliveryRound: assignments.deliveryRound,
      })
      .from(assignments)
      .where(eq(assignments.driverEmployeeId, driverEmployeeId))
  );

  for (const row of fromDriverColumn) {
    keys.add(`${row.vehicleId}-${row.deliveryRound}`);
  }

  if (employee?.assignedVehicleId) {
    const onAssignedTruck = await dbAll(
      db
        .select({ deliveryRound: assignments.deliveryRound })
        .from(assignments)
        .where(eq(assignments.vehicleId, employee.assignedVehicleId))
    );
    for (const row of onAssignedTruck) {
      keys.add(`${employee.assignedVehicleId}-${row.deliveryRound}`);
    }
  }

  const staffDriverOrders = await dbAll(
    db
      .select({ orderId: orderEmployeeAssignments.orderId })
      .from(orderEmployeeAssignments)
      .where(
        and(
          eq(orderEmployeeAssignments.employeeId, driverEmployeeId),
          eq(orderEmployeeAssignments.role, "driver")
        )
      )
  );

  for (const { orderId } of staffDriverOrders) {
    const assignment = await getTruckAssignmentForOrder(orderId);
    if (assignment) {
      keys.add(`${assignment.vehicleId}-${assignment.deliveryRound}`);
    }
  }

  const trucks = await Promise.all(
    [...keys].map(async (key) => {
      const [vehicleId, deliveryRound] = key.split("-").map(Number);
      return getTruckLoadStatus(vehicleId, deliveryRound);
    })
  );

  return trucks
    .filter((t) => t.totalOrders > 0)
    .sort((a, b) => a.deliveryRound - b.deliveryRound);
}

export async function orderHasDeparted(orderId: number): Promise<boolean> {
  const db = await getDb();
  const proof = await dbOne(
    db
      .select()
      .from(deliveryProofs)
      .where(
        and(
          eq(deliveryProofs.orderId, orderId),
          eq(deliveryProofs.phase, "departed")
        )
      )
  );
  return Boolean(proof);
}

export async function orderWasLoaded(orderId: number): Promise<boolean> {
  return (await getOrderLoadStatus(orderId)).loadStatus === "loaded";
}
