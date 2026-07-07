import { eq, and, sql, inArray } from "drizzle-orm";
import { DELIVERY_ROUNDS, MAX_DELIVERY_ROUNDS } from "@/lib/constants";
import { getDb } from "@/lib/db";
import { dbAll, dbOne } from "@/lib/db/query";
import {
  assignments,
  orderEmployeeAssignments,
  orders,
  vehicles,
} from "@/lib/db/schema";
import {
  getDriverForVehicle,
  getEmployee,
  updateEmployee,
} from "@/lib/services/employees";
import { createEmployeeNotification } from "@/lib/services/employee-notifications";
import { employeeStatusMessage } from "@/lib/log-messages";
import { logActivity } from "@/lib/logger";
import {
  getOrderLoadStatus,
  getTruckAssignmentForOrder,
  getTruckLoadStatus,
  type TruckLoadStatus,
} from "@/lib/services/load-coordination";
import { getVehicleLoad } from "@/lib/services/orders";
import { updateVehicleStatus } from "@/lib/services/vehicles";

export type TruckRoundStatus = "empty" | "loading" | "ready" | "departed";

export interface TruckRoundSummary {
  round: number;
  orderCount: number;
  pallets: number;
  status: TruckRoundStatus;
  statusLabel: string;
  onTheRoad: boolean;
}

export interface TruckWorkspaceSnapshot {
  vehicleId: number;
  suggestedRound: number;
  suggestedReason: string;
  onTheRoad: boolean;
  onRoadRound: number | null;
  returningFromRound: number | null;
  returningToWarehouse: boolean;
  prepRound: number;
  prepOrderCount: number;
  vehicleStatus: string | null;
  driverName: string | null;
  driverStatus: string | null;
  rounds: TruckRoundSummary[];
}

function roundStatusFromLoad(
  truck: TruckLoadStatus | null,
  orderCount: number
): { status: TruckRoundStatus; label: string } {
  if (orderCount === 0) return { status: "empty", label: "Empty" };
  if (!truck) return { status: "loading", label: "Loading" };
  if (truck.hasFullyDeparted) {
    return { status: "departed", label: "On the road" };
  }
  if (truck.canDepart) {
    return { status: "ready", label: "Ready to leave" };
  }
  if (truck.allResolved) {
    return { status: "ready", label: "Awaiting driver" };
  }
  return {
    status: "loading",
    label: `Loading ${truck.resolvedCount}/${truck.totalOrders}`,
  };
}

async function hasUndeliveredOrdersOnRound(
  vehicleId: number,
  deliveryRound: number
): Promise<boolean> {
  const db = await getDb();
  const row = await dbOne(
    db
      .select({ id: orders.id })
      .from(assignments)
      .innerJoin(orders, eq(assignments.orderId, orders.id))
      .where(
        and(
          eq(assignments.vehicleId, vehicleId),
          eq(assignments.deliveryRound, deliveryRound),
          sql`${orders.status} NOT IN ('delivered', 'cancelled')`
        )
      )
  );
  return Boolean(row);
}

/** True when every loaded order on a departed round is delivered/cancelled. */
export async function isDeliveryRoundComplete(
  vehicleId: number,
  deliveryRound: number
): Promise<boolean> {
  const truck = await getTruckLoadStatus(vehicleId, deliveryRound);
  if (truck.totalOrders === 0 || !truck.hasFullyDeparted) return false;

  const db = await getDb();
  const rows = await dbAll(
    db
      .select({
        orderId: orders.id,
        status: orders.status,
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

  for (const row of rows) {
    const { loadStatus } = await getOrderLoadStatus(row.orderId);
    if (loadStatus === "load_skipped") continue;
    if (loadStatus === "pending") return false;
    if (
      loadStatus === "loaded" &&
      row.status !== "delivered" &&
      row.status !== "cancelled"
    ) {
      return false;
    }
  }

  return true;
}

export async function syncAfterTruckDeparture(
  vehicleId: number,
  driverEmployeeId: number
) {
  const { markDriverOnTheRoad } = await import("@/lib/services/employees");
  await markDriverOnTheRoad(driverEmployeeId);
  const db = await getDb();
  const vehicle = await dbOne(
    db
      .select({ status: vehicles.status })
      .from(vehicles)
      .where(eq(vehicles.id, vehicleId))
  );
  if (vehicle?.status !== "on_road") {
    await updateVehicleStatus(vehicleId, "on_road");
  }
}

export async function syncAfterOrderDelivered(orderId: number) {
  const assignment = await getTruckAssignmentForOrder(orderId);
  if (!assignment) return;

  const complete = await isDeliveryRoundComplete(
    assignment.vehicleId,
    assignment.deliveryRound
  );
  if (!complete) return;

  const driver =
    assignment.driverEmployeeId != null
      ? await getEmployee(assignment.driverEmployeeId)
      : await getDriverForVehicle(assignment.vehicleId);

  if (driver && driver.status !== "available") {
    const from = driver.status;
    await updateEmployee(driver.id, { status: "available" });
    await logActivity(
      "update",
      "employee",
      driver.id,
      employeeStatusMessage(driver.name, from, "available"),
      {
        category: "employees",
        details: {
          employeeId: driver.id,
          from,
          to: "available",
          reason: "round_deliveries_complete",
          vehicleId: assignment.vehicleId,
          deliveryRound: assignment.deliveryRound,
        },
      }
    );
  }

  await updateVehicleStatus(assignment.vehicleId, "returning");
}

async function findWarehousePrepRound(
  vehicleId: number
): Promise<number | null> {
  for (const round of DELIVERY_ROUNDS) {
    const truck = await getTruckLoadStatus(vehicleId, round);
    if (truck.totalOrders === 0 || truck.hasFullyDeparted) continue;
    return round;
  }
  return null;
}

async function notifyPickersTruckArrived(
  vehicleId: number,
  deliveryRound: number,
  vehicleName: string,
  plateNumber: string
): Promise<number> {
  const db = await getDb();
  const assignmentRows = await dbAll(
    db
      .select({ orderId: assignments.orderId })
      .from(assignments)
      .where(
        and(
          eq(assignments.vehicleId, vehicleId),
          eq(assignments.deliveryRound, deliveryRound)
        )
      )
  );

  const pendingOrderIds: number[] = [];
  for (const row of assignmentRows) {
    const { loadStatus } = await getOrderLoadStatus(row.orderId);
    if (loadStatus === "pending") {
      pendingOrderIds.push(row.orderId);
    }
  }
  if (pendingOrderIds.length === 0) return 0;

  const staffRows = await dbAll(
    db
      .select({ employeeId: orderEmployeeAssignments.employeeId })
      .from(orderEmployeeAssignments)
      .where(
        and(
          inArray(orderEmployeeAssignments.orderId, pendingOrderIds),
          inArray(orderEmployeeAssignments.role, ["picker", "unloader"])
        )
      )
  );

  const pickerIds = [...new Set(staffRows.map((r) => r.employeeId))];
  const truckLabel = `${vehicleName} (${plateNumber})`;
  const message = `${truckLabel} mbërriti në depo — ngarko porositë e raundit ${deliveryRound} (${pendingOrderIds.length} porosi).`;

  for (const pickerId of pickerIds) {
    await createEmployeeNotification({
      employeeId: pickerId,
      type: "truck_arrived",
      vehicleId,
      deliveryRound,
      message,
    });
  }

  return pickerIds.length;
}

export async function confirmTruckArrivedAtWarehouse(
  driverEmployeeId: number
): Promise<
  | { ok: true; prepRound: number | null; notifiedPickers: number }
  | { ok: false; error: string }
> {
  const employee = await getEmployee(driverEmployeeId);
  if (!employee?.assignedVehicleId) {
    return { ok: false, error: "No truck linked to this driver" };
  }

  const vehicleId = employee.assignedVehicleId;
  const db = await getDb();
  const vehicle = await dbOne(
    db.select().from(vehicles).where(eq(vehicles.id, vehicleId))
  );
  if (!vehicle) return { ok: false, error: "Vehicle not found" };

  if (vehicle.status !== "returning") {
    return {
      ok: false,
      error: "Truck is not marked as returning to the warehouse",
    };
  }

  const prepRound = await findWarehousePrepRound(vehicleId);

  await updateVehicleStatus(vehicleId, "available");

  if (employee.status !== "available") {
    const from = employee.status;
    await updateEmployee(driverEmployeeId, { status: "available" });
    await logActivity(
      "update",
      "employee",
      driverEmployeeId,
      employeeStatusMessage(employee.name, from, "available"),
      {
        category: "employees",
        details: {
          employeeId: driverEmployeeId,
          from,
          to: "available",
          reason: "truck_arrived_at_warehouse",
          vehicleId,
        },
      }
    );
  }

  let notifiedPickers = 0;
  if (prepRound != null) {
    notifiedPickers = await notifyPickersTruckArrived(
      vehicleId,
      prepRound,
      vehicle.name,
      vehicle.plateNumber
    );
  }

  await logActivity(
    "update",
    "vehicle",
    vehicleId,
    `${vehicle.name} arrived at warehouse${prepRound != null ? ` — round ${prepRound} ready to load` : ""}`,
    {
      category: "deliveries",
      details: {
        vehicleId,
        driverEmployeeId,
        prepRound,
        notifiedPickers,
        from: "returning",
        to: "available",
      },
    }
  );

  return { ok: true, prepRound, notifiedPickers };
}

export async function clearVehicleReturningIfPrepping(vehicleId: number) {
  const db = await getDb();
  const vehicle = await dbOne(
    db.select({ status: vehicles.status }).from(vehicles).where(eq(vehicles.id, vehicleId))
  );
  if (vehicle?.status === "returning") {
    await updateVehicleStatus(vehicleId, "available");
  }
}

export async function resolveAssignmentDeliveryRound(
  vehicleId: number
): Promise<{ round: number; reason: string }> {
  let highestDepartedOnRoad = 0;
  let lowestWarehouseRound = 0;

  for (const round of DELIVERY_ROUNDS) {
    const truck = await getTruckLoadStatus(vehicleId, round);
    if (truck.totalOrders === 0) continue;

    if (truck.hasFullyDeparted) {
      if (await hasUndeliveredOrdersOnRound(vehicleId, round)) {
        highestDepartedOnRoad = Math.max(highestDepartedOnRoad, round);
      }
    } else if (lowestWarehouseRound === 0 || round < lowestWarehouseRound) {
      lowestWarehouseRound = round;
    }
  }

  if (lowestWarehouseRound > 0) {
    return {
      round: lowestWarehouseRound,
      reason: `Truck is still loading at the warehouse (round ${lowestWarehouseRound}).`,
    };
  }

  if (highestDepartedOnRoad > 0) {
    const next = Math.min(highestDepartedOnRoad + 1, MAX_DELIVERY_ROUNDS);
    return {
      round: next,
      reason: `Truck is on the road with round ${highestDepartedOnRoad} — new orders go to round ${next}.`,
    };
  }

  for (const round of DELIVERY_ROUNDS) {
    const truck = await getTruckLoadStatus(vehicleId, round);
    if (truck.totalOrders === 0) {
      return {
        round,
        reason: `First available trip slot is round ${round}.`,
      };
    }
  }

  return {
    round: MAX_DELIVERY_ROUNDS,
    reason: `All ${MAX_DELIVERY_ROUNDS} trip slots have orders — using round ${MAX_DELIVERY_ROUNDS}.`,
  };
}

export async function getTruckWorkspaceSnapshot(
  vehicleId: number
): Promise<TruckWorkspaceSnapshot> {
  const db = await getDb();
  const vehicleRow = await dbOne(
    db
      .select({ status: vehicles.status })
      .from(vehicles)
      .where(eq(vehicles.id, vehicleId))
  );
  const driver = await getDriverForVehicle(vehicleId);
  const { round: suggestedRound, reason: suggestedReason } =
    await resolveAssignmentDeliveryRound(vehicleId);

  let onRoadRound: number | null = null;
  let returningFromRound: number | null = null;
  const rounds: TruckRoundSummary[] = [];

  for (const round of DELIVERY_ROUNDS) {
    const [truck, load] = await Promise.all([
      getTruckLoadStatus(vehicleId, round),
      getVehicleLoad(vehicleId, round),
    ]);
    const orderCount = load.totals.orders;
    const { status, label } = roundStatusFromLoad(truck, orderCount);
    const onTheRoad =
      status === "departed" &&
      (await hasUndeliveredOrdersOnRound(vehicleId, round));
    if (onTheRoad) {
      onRoadRound = onRoadRound == null ? round : Math.max(onRoadRound, round);
    }
    if (
      truck.hasFullyDeparted &&
      orderCount > 0 &&
      !(await hasUndeliveredOrdersOnRound(vehicleId, round))
    ) {
      returningFromRound =
        returningFromRound == null
          ? round
          : Math.max(returningFromRound, round);
    }
    rounds.push({
      round,
      orderCount,
      pallets: load.totals.pallets,
      status,
      statusLabel: label,
      onTheRoad,
    });
  }

  const prepRound = suggestedRound;
  const prepOrderCount =
    rounds.find((r) => r.round === prepRound)?.orderCount ?? 0;
  const returningToWarehouse =
    vehicleRow?.status === "returning" || returningFromRound != null;

  return {
    vehicleId,
    suggestedRound,
    suggestedReason: returningToWarehouse
      ? returningFromRound != null
        ? `Driver finished round ${returningFromRound} — prepare round ${prepRound} while truck returns (${prepOrderCount} order${prepOrderCount === 1 ? "" : "s"} already assigned).`
        : `Truck returning to warehouse — prepare round ${prepRound}.`
      : suggestedReason,
    onTheRoad: onRoadRound != null,
    onRoadRound,
    returningFromRound,
    returningToWarehouse,
    prepRound,
    prepOrderCount,
    vehicleStatus: vehicleRow?.status ?? null,
    driverName: driver?.name ?? null,
    driverStatus: driver?.status ?? null,
    rounds,
  };
}

export function truckRoundStatusTone(
  status: TruckRoundStatus
): "neutral" | "amber" | "blue" | "green" {
  switch (status) {
    case "departed":
      return "blue";
    case "ready":
      return "green";
    case "loading":
      return "amber";
    default:
      return "neutral";
  }
}
