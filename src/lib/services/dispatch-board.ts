import { eq, and, sql, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll } from "@/lib/db/query";
import {
  assignments,
  employees,
  orderEmployeeAssignments,
  orders,
} from "@/lib/db/schema";
import { MAX_DELIVERY_ROUNDS } from "@/lib/constants";
import { groupSpreadKm } from "@/lib/dispatch/route-cluster-utils";
import { isOrderReadyToShip } from "@/lib/delivery-schedule";
import { isOrderUrgent, normalizeOrderPriority } from "@/lib/order-priority";
import { getVehicleLoad } from "@/lib/services/orders";
import { getTruckLoadStatus } from "@/lib/services/load-coordination";
import { getDriverForVehicle } from "@/lib/services/employees";
import { listVehicles } from "@/lib/services/vehicles";

export interface DispatchBoardOrder {
  id: number;
  invoiceNumber: string;
  customerName: string;
  location: string;
  city: string | null;
  region: string | null;
  totalPallets: number;
  totalM2: number;
  totalWeightKg: number;
  priority: "normal" | "urgent";
  loadStatus?: string;
  pickerName: string | null;
}

export interface DispatchBoardRound {
  round: number;
  orders: DispatchBoardOrder[];
  totalPallets: number;
  maxPallets: number;
  regions: string[];
  spreadKm: number;
  pickerNames: string[];
  status: "empty" | "loading" | "ready" | "departed";
  statusLabel: string;
}

export interface DispatchBoardTruck {
  vehicleId: number;
  name: string;
  plateNumber: string;
  maxPallets: number;
  driverName: string | null;
  rounds: DispatchBoardRound[];
}

export interface PickerWorkloadRow {
  id: number;
  name: string;
  orderCount: number;
  palletCount: number;
  status: string;
}

export interface DispatchBoard {
  pickerWorkload: PickerWorkloadRow[];
  unassignedOrders: DispatchBoardOrder[];
  unassignedUrgent: DispatchBoardOrder[];
  unassignedCount: number;
  trucks: DispatchBoardTruck[];
}

async function pickerNamesForOrders(
  orderIds: number[]
): Promise<Map<number, string>> {
  const unique = [...new Set(orderIds)];
  if (unique.length === 0) return new Map();

  const db = await getDb();
  const rows = await dbAll(
    db
      .select({
        orderId: orderEmployeeAssignments.orderId,
        name: employees.name,
      })
      .from(orderEmployeeAssignments)
      .innerJoin(employees, eq(orderEmployeeAssignments.employeeId, employees.id))
      .where(
        and(
          inArray(orderEmployeeAssignments.orderId, unique),
          eq(orderEmployeeAssignments.role, "picker")
        )
      )
  );

  const map = new Map<number, string>();
  for (const row of rows) {
    if (!map.has(row.orderId)) map.set(row.orderId, row.name);
  }
  return map;
}

function toBoardOrder(
  o: (typeof orders.$inferSelect),
  pickerNames: Map<number, string>
): DispatchBoardOrder {
  return {
    id: o.id,
    invoiceNumber: o.invoiceNumber,
    customerName: o.customerName,
    location: o.location,
    city: o.city,
    region: o.region,
    totalPallets: o.totalPallets,
    totalM2: o.totalM2,
    totalWeightKg: o.totalWeightKg,
    priority: normalizeOrderPriority(o.priority, o.notes),
    pickerName: pickerNames.get(o.id) ?? null,
  };
}

function roundStatus(
  truckStatus: Awaited<ReturnType<typeof getTruckLoadStatus>> | null,
  orderCount: number
): { status: DispatchBoardRound["status"]; label: string } {
  if (orderCount === 0) return { status: "empty", label: "Empty" };
  if (!truckStatus) return { status: "loading", label: "Loading" };
  if (truckStatus.hasFullyDeparted) {
    return { status: "departed", label: "On the road / done" };
  }
  if (truckStatus.canDepart) {
    return { status: "ready", label: "Ready to leave" };
  }
  if (truckStatus.allResolved) {
    return { status: "ready", label: "Loader done — awaiting driver" };
  }
  return {
    status: "loading",
    label: `Loading ${truckStatus.resolvedCount}/${truckStatus.totalOrders}`,
  };
}

export async function getDispatchBoard(
  maxRounds = MAX_DELIVERY_ROUNDS
): Promise<DispatchBoard> {
  const db = await getDb();
  const fleet = await listVehicles();

  const pickerRows = await dbAll(
    db
      .select({
        id: employees.id,
        name: employees.name,
        status: employees.status,
        roles: employees.roles,
      })
      .from(employees)
  );
  const pickers = pickerRows.filter((e) => {
    try {
      return (JSON.parse(e.roles) as string[]).includes("picker");
    } catch {
      return false;
    }
  });

  const pickerWorkload: PickerWorkloadRow[] = await Promise.all(
    pickers.map(async (p) => {
      const rows = await dbAll(
        db
          .select({
            pallets: orders.totalPallets,
          })
          .from(orderEmployeeAssignments)
          .innerJoin(orders, eq(orderEmployeeAssignments.orderId, orders.id))
          .where(
            and(
              eq(orderEmployeeAssignments.employeeId, p.id),
              eq(orderEmployeeAssignments.role, "picker"),
              sql`${orders.status} NOT IN ('delivered', 'cancelled')`
            )
          )
      );
      return {
        id: p.id,
        name: p.name,
        status: p.status,
        orderCount: rows.length,
        palletCount: rows.reduce((s, r) => s + r.pallets, 0),
      };
    })
  );
  pickerWorkload.sort((a, b) => b.orderCount - a.orderCount);

  const unassignedRows = await dbAll(
    db
      .select()
      .from(orders)
      .where(
        sql`NOT EXISTS (SELECT 1 FROM assignments a WHERE a.order_id = ${orders.id}) AND ${orders.status} NOT IN ('delivered', 'cancelled')`
      )
  );

  const readyUnassigned = unassignedRows.filter((o) => isOrderReadyToShip(o));
  const unassignedPickerNames = await pickerNamesForOrders(
    readyUnassigned.map((o) => o.id)
  );

  const unassignedOrders: DispatchBoardOrder[] = readyUnassigned.map((o) =>
    toBoardOrder(o, unassignedPickerNames)
  );

  const unassignedUrgent = unassignedOrders.filter((o) =>
    unassignedRows.some((row) => row.id === o.id && isOrderUrgent(row))
  );

  const trucks: DispatchBoardTruck[] = [];
  const assignedOrderIds: number[] = [];
  const pendingRounds: Array<{
    vehicle: (typeof fleet)[number];
    driverName: string | null;
    round: number;
    activeOrders: Awaited<ReturnType<typeof getVehicleLoad>>["assignedOrders"];
    totalPallets: number;
    spreadKm: number;
    regions: string[];
    status: DispatchBoardRound["status"];
    statusLabel: string;
  }> = [];

  for (const v of fleet) {
    const driver = await getDriverForVehicle(v.id);

    for (let round = 1; round <= maxRounds; round++) {
      const load = await getVehicleLoad(v.id, round);
      const activeOrders = load.assignedOrders.filter(
        (o) => o.status !== "delivered" && o.status !== "cancelled"
      );

      if (activeOrders.length === 0 && round > 2) continue;

      assignedOrderIds.push(...activeOrders.map((o) => o.id));

      const geo = activeOrders.filter((o) => o.lat != null && o.lng != null);
      const spreadKm =
        geo.length >= 2
          ? Math.round(
              groupSpreadKm(
                geo.map((o) => ({ lat: o.lat!, lng: o.lng! }))
              ) * 10
            ) / 10
          : 0;

      const regions = [
        ...new Set(
          activeOrders.map((o) => o.region ?? o.city).filter(Boolean) as string[]
        ),
      ];

      const truckStatus =
        activeOrders.length > 0
          ? await getTruckLoadStatus(v.id, round)
          : null;
      const { status, label } = roundStatus(truckStatus, activeOrders.length);

      pendingRounds.push({
        vehicle: v,
        driverName: driver?.name ?? null,
        round,
        activeOrders,
        totalPallets: load.totals.pallets,
        spreadKm,
        regions,
        status,
        statusLabel: label,
      });
    }
  }

  const assignedPickerNames = await pickerNamesForOrders(assignedOrderIds);

  const truckMap = new Map<number, DispatchBoardTruck>();
  for (const row of pendingRounds) {
    const boardOrders = row.activeOrders.map((o) =>
      toBoardOrder(o, assignedPickerNames)
    );
    const pickerNames = [
      ...new Set(
        boardOrders.map((o) => o.pickerName).filter(Boolean) as string[]
      ),
    ];

    const roundEntry: DispatchBoardRound = {
      round: row.round,
      orders: boardOrders,
      totalPallets: row.totalPallets,
      maxPallets: row.vehicle.maxPallets,
      regions: row.regions,
      spreadKm: row.spreadKm,
      pickerNames,
      status: row.status,
      statusLabel: row.statusLabel,
    };

    const existing = truckMap.get(row.vehicle.id);
    if (existing) {
      existing.rounds.push(roundEntry);
    } else {
      truckMap.set(row.vehicle.id, {
        vehicleId: row.vehicle.id,
        name: row.vehicle.name,
        plateNumber: row.vehicle.plateNumber,
        maxPallets: row.vehicle.maxPallets,
        driverName: row.driverName,
        rounds: [roundEntry],
      });
    }
  }

  for (const v of fleet) {
    const truck = truckMap.get(v.id);
    if (!truck) continue;
    if (
      truck.rounds.some((r) => r.orders.length > 0 || r.totalPallets > 0) ||
      v.status === "available"
    ) {
      trucks.push(truck);
    }
  }

  trucks.sort((a, b) => {
    const aLoad = a.rounds.reduce((s, r) => s + r.totalPallets, 0);
    const bLoad = b.rounds.reduce((s, r) => s + r.totalPallets, 0);
    return bLoad - aLoad;
  });

  return {
    pickerWorkload,
    unassignedOrders,
    unassignedUrgent,
    unassignedCount: unassignedRows.length,
    trucks,
  };
}
