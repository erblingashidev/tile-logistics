import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll, dbOne } from "@/lib/db/query";
import {
  assignments,
  employees,
  orderEmployeeAssignments,
  orders,
} from "@/lib/db/schema";

export type PickerAssignmentContext = {
  /** `${vehicleId}:${deliveryRound}` → picker responsible for that truck load */
  truckPicker: Map<string, number>;
  /** Picker → orders planned this planning session (for balance) */
  plannedOrders: Map<number, number>;
};

export function truckRoundKey(vehicleId: number, deliveryRound: number): string {
  return `${vehicleId}:${deliveryRound}`;
}

export async function pickerForOrder(
  orderId: number
): Promise<{ id: number; name: string } | null> {
  const db = await getDb();
  const row = await dbAll(
    db
      .select({
        id: employees.id,
        name: employees.name,
      })
      .from(orderEmployeeAssignments)
      .innerJoin(employees, eq(orderEmployeeAssignments.employeeId, employees.id))
      .where(
        and(
          eq(orderEmployeeAssignments.orderId, orderId),
          eq(orderEmployeeAssignments.role, "picker")
        )
      )
      .limit(1)
  );
  return row[0] ?? null;
}

/** Primary picker already loading this truck + round. */
export async function pickerOnTruckRound(
  vehicleId: number,
  deliveryRound: number
): Promise<{ id: number; name: string } | null> {
  const db = await getDb();
  const rows = await dbAll(
    db
      .select({
        employeeId: orderEmployeeAssignments.employeeId,
        name: employees.name,
      })
      .from(assignments)
      .innerJoin(
        orderEmployeeAssignments,
        eq(orderEmployeeAssignments.orderId, assignments.orderId)
      )
      .innerJoin(employees, eq(employees.id, orderEmployeeAssignments.employeeId))
      .where(
        and(
          eq(assignments.vehicleId, vehicleId),
          eq(assignments.deliveryRound, deliveryRound),
          eq(orderEmployeeAssignments.role, "picker")
        )
      )
  );
  if (rows.length === 0) return null;

  const counts = new Map<number, { name: string; count: number }>();
  for (const row of rows) {
    const cur = counts.get(row.employeeId) ?? { name: row.name, count: 0 };
    cur.count += 1;
    counts.set(row.employeeId, cur);
  }

  let best: { id: number; name: string; count: number } | null = null;
  for (const [id, value] of counts) {
    if (!best || value.count > best.count) {
      best = { id, name: value.name, count: value.count };
    }
  }
  return best ? { id: best.id, name: best.name } : null;
}

/** Pickers already loading a different truck on this delivery round. */
export async function pickersOnOtherTrucksThisRound(
  vehicleId: number,
  deliveryRound: number
): Promise<Set<number>> {
  const db = await getDb();
  const rows = await dbAll(
    db
      .select({
        employeeId: orderEmployeeAssignments.employeeId,
      })
      .from(assignments)
      .innerJoin(
        orderEmployeeAssignments,
        eq(orderEmployeeAssignments.orderId, assignments.orderId)
      )
      .where(
        and(
          eq(assignments.deliveryRound, deliveryRound),
          ne(assignments.vehicleId, vehicleId),
          eq(orderEmployeeAssignments.role, "picker")
        )
      )
  );
  return new Set(rows.map((r) => r.employeeId));
}

async function pickerWorkload(pickerId: number): Promise<number> {
  const db = await getDb();
  const row = await dbOne(
    db
      .select({ count: sql<number>`count(*)` })
      .from(orderEmployeeAssignments)
      .innerJoin(orders, eq(orderEmployeeAssignments.orderId, orders.id))
      .where(
        and(
          eq(orderEmployeeAssignments.employeeId, pickerId),
          eq(orderEmployeeAssignments.role, "picker"),
          sql`${orders.status} NOT IN ('delivered', 'cancelled')`
        )
      )
  );
  return row?.count ?? 0;
}

function pickersClaimedInContext(
  ctx: PickerAssignmentContext | undefined,
  vehicleId: number,
  deliveryRound: number
): Set<number> {
  const claimed = new Set<number>();
  if (!ctx) return claimed;
  const prefix = `${vehicleId}:${deliveryRound}`;
  for (const [key, pickerId] of ctx.truckPicker) {
    if (key !== prefix) claimed.add(pickerId);
  }
  return claimed;
}

/**
 * One picker owns each truck+round. Pickers are spread across trucks by workload.
 */
export async function resolvePickerForTruck(
  vehicleId: number,
  deliveryRound: number,
  options?: {
    ctx?: PickerAssignmentContext;
    orderCount?: number;
  }
): Promise<{ id: number | null; name: string | null }> {
  const ctx = options?.ctx;
  const orderCount = options?.orderCount ?? 1;
  const key = truckRoundKey(vehicleId, deliveryRound);

  const onTruck = await pickerOnTruckRound(vehicleId, deliveryRound);
  if (onTruck) {
    ctx?.truckPicker.set(key, onTruck.id);
    return onTruck;
  }

  const cachedId = ctx?.truckPicker.get(key);
  if (cachedId) {
    const db = await getDb();
    const row = await dbOne(
      db
        .select({ id: employees.id, name: employees.name })
        .from(employees)
        .where(eq(employees.id, cachedId))
    );
    if (row) return row;
  }

  const db = await getDb();
  const rows = await dbAll(
    db
      .select({
        id: employees.id,
        name: employees.name,
        status: employees.status,
        roles: employees.roles,
      })
      .from(employees)
  );

  const pickers = rows.filter((e) => {
    try {
      return (JSON.parse(e.roles) as string[]).includes("picker");
    } catch {
      return false;
    }
  }).filter((e) => e.status !== "off_duty");

  if (pickers.length === 0) return { id: null, name: null };

  const busyElsewhere = new Set([
    ...(await pickersOnOtherTrucksThisRound(vehicleId, deliveryRound)),
    ...pickersClaimedInContext(ctx, vehicleId, deliveryRound),
  ]);

  const withWorkload = await Promise.all(
    pickers.map(async (e) => ({
      ...e,
      workload:
        (await pickerWorkload(e.id)) + (ctx?.plannedOrders.get(e.id) ?? 0),
    }))
  );

  const available = withWorkload.filter((p) => !busyElsewhere.has(p.id));
  const pool = available.length > 0 ? available : withWorkload;

  pool.sort((a, b) => {
    if (a.workload !== b.workload) return a.workload - b.workload;
    return a.id - b.id;
  });

  const preferred = pool[0];
  ctx?.truckPicker.set(key, preferred.id);
  ctx?.plannedOrders.set(
    preferred.id,
    (ctx?.plannedOrders.get(preferred.id) ?? 0) + orderCount
  );

  return { id: preferred.id, name: preferred.name };
}

export async function pickerFromRouteOrders(
  routeOrderIds: number[]
): Promise<{ id: number; name: string } | null> {
  for (const orderId of routeOrderIds) {
    const picker = await pickerForOrder(orderId);
    if (picker) return picker;
  }
  return null;
}

/** When assigning to a truck, always use the truck's existing picker if one exists. */
export async function enforceTruckPicker(
  vehicleId: number,
  deliveryRound: number,
  requestedPickerId: number | null
): Promise<number | null> {
  const onTruck = await pickerOnTruckRound(vehicleId, deliveryRound);
  if (onTruck) return onTruck.id;
  return requestedPickerId;
}
