import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll } from "@/lib/db/query";
import {
  assignments,
  employees,
  orderEmployeeAssignments,
} from "@/lib/db/schema";

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

/** Picker already working this truck + round (most common if split). */
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

export async function pickerFromRouteOrders(
  routeOrderIds: number[]
): Promise<{ id: number; name: string } | null> {
  for (const orderId of routeOrderIds) {
    const picker = await pickerForOrder(orderId);
    if (picker) return picker;
  }
  return null;
}
