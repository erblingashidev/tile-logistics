import { eq, and, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll } from "@/lib/db/query";
import {
  assignments,
  employees,
  orderEmployeeAssignments,
  orders,
} from "@/lib/db/schema";
import { MAX_DELIVERY_ROUNDS } from "@/lib/constants";
import { distanceKm } from "@/lib/locations";
import { groupSpreadKm } from "@/lib/dispatch/route-cluster-utils";
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
  region: string | null;
  totalPallets: number;
  totalM2: number;
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
  unassignedUrgent: DispatchBoardOrder[];
  unassignedCount: number;
  trucks: DispatchBoardTruck[];
}

async function pickerNameForOrder(orderId: number): Promise<string | null> {
  const db = await getDb();
  const row = await dbAll(
    db
      .select({ name: employees.name })
      .from(orderEmployeeAssignments)
      .innerJoin(employees, eq(orderEmployeeAssignments.employeeId, employees.id))
      .where(
        and(
          eq(orderEmployeeAssignments.orderId, orderId),
          eq(orderEmployeeAssignments.role, "picker")
        )
      )
  );
  return row[0]?.name ?? null;
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

  const unassignedUrgent: DispatchBoardOrder[] = [];
  for (const o of unassignedRows) {
    if (!isOrderUrgent(o)) continue;
    unassignedUrgent.push({
      id: o.id,
      invoiceNumber: o.invoiceNumber,
      customerName: o.customerName,
      location: o.location,
      region: o.region,
      totalPallets: o.totalPallets,
      totalM2: o.totalM2,
      priority: normalizeOrderPriority(o.priority, o.notes),
      pickerName: await pickerNameForOrder(o.id),
    });
  }

  const trucks: DispatchBoardTruck[] = [];

  for (const v of fleet) {
    const driver = await getDriverForVehicle(v.id);
    const rounds: DispatchBoardRound[] = [];

    for (let round = 1; round <= maxRounds; round++) {
      const load = await getVehicleLoad(v.id, round);
      const activeOrders = load.assignedOrders.filter(
        (o) => o.status !== "delivered" && o.status !== "cancelled"
      );

      if (activeOrders.length === 0 && round > 2) continue;

      const boardOrders: DispatchBoardOrder[] = await Promise.all(
        activeOrders.map(async (o) => ({
          id: o.id,
          invoiceNumber: o.invoiceNumber,
          customerName: o.customerName,
          location: o.location,
          region: o.region,
          totalPallets: o.totalPallets,
          totalM2: o.totalM2,
          priority: normalizeOrderPriority(o.priority, o.notes),
          pickerName: await pickerNameForOrder(o.id),
        }))
      );

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

      const pickerNames = [
        ...new Set(
          boardOrders.map((o) => o.pickerName).filter(Boolean) as string[]
        ),
      ];

      const truckStatus =
        activeOrders.length > 0
          ? await getTruckLoadStatus(v.id, round)
          : null;
      const { status, label } = roundStatus(truckStatus, activeOrders.length);

      rounds.push({
        round,
        orders: boardOrders,
        totalPallets: load.totals.pallets,
        maxPallets: v.maxPallets,
        regions,
        spreadKm,
        pickerNames,
        status,
        statusLabel: label,
      });
    }

    if (rounds.some((r) => r.orders.length > 0) || v.status === "available") {
      trucks.push({
        vehicleId: v.id,
        name: v.name,
        plateNumber: v.plateNumber,
        maxPallets: v.maxPallets,
        driverName: driver?.name ?? null,
        rounds,
      });
    }
  }

  trucks.sort((a, b) => {
    const aLoad = a.rounds.reduce((s, r) => s + r.totalPallets, 0);
    const bLoad = b.rounds.reduce((s, r) => s + r.totalPallets, 0);
    return bLoad - aLoad;
  });

  return {
    pickerWorkload,
    unassignedUrgent,
    unassignedCount: unassignedRows.length,
    trucks,
  };
}
