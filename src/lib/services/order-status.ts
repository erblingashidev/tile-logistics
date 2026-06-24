import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbOne } from "@/lib/db/query";
import { employees, orders } from "@/lib/db/schema";
import type { OrderStatus } from "@/lib/constants";
import { logActivity } from "@/lib/logger";
import { orderStatusChangeMessage } from "@/lib/log-messages";

export async function updateOrderStatus(
  orderId: number,
  status: OrderStatus,
  actorEmployeeId?: number
) {
  const db = await getDb();
  const order = await dbOne(
    db.select().from(orders).where(eq(orders.id, orderId))
  );
  if (!order) return null;

  const now = new Date().toISOString();
  const statusChanged = order.status !== status;

  await db
    .update(orders)
    .set({ status, updatedAt: now })
    .where(eq(orders.id, orderId));

  if (!statusChanged) {
    return { orderId, status, changed: false };
  }

  let actorName = "System";
  if (actorEmployeeId) {
    const actor = await dbOne(
      db
        .select({ name: employees.name })
        .from(employees)
        .where(eq(employees.id, actorEmployeeId))
    );
    actorName = actor?.name ?? "Employee";
  }

  await logActivity(
    "status_change",
    "order",
    orderId,
    orderStatusChangeMessage(
      order.invoiceNumber,
      order.status,
      status,
      actorName
    ),
    {
      category: "deliveries",
      details: {
        invoiceNumber: order.invoiceNumber,
        from: order.status,
        to: status,
        actorEmployeeId,
      },
    }
  );

  return { orderId, status, changed: true };
}
