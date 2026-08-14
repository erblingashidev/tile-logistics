import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll, dbOne } from "@/lib/db/query";
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

/** Update many orders at once — one activity log for linked bulk changes. */
export async function updateOrderStatusBatch(
  orderIds: number[],
  status: OrderStatus,
  options?: { linkedGroup?: boolean }
) {
  const unique = [...new Set(orderIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (unique.length === 0) return [];

  if (unique.length === 1) {
    const result = await updateOrderStatus(unique[0]!, status);
    return result ? [result] : [];
  }

  const db = await getDb();
  const now = new Date().toISOString();
  const rows = await dbAll(
    db
      .select({
        id: orders.id,
        status: orders.status,
        invoiceNumber: orders.invoiceNumber,
      })
      .from(orders)
      .where(inArray(orders.id, unique))
  );

  const toUpdate = rows.filter((row) => row.status !== status);
  if (toUpdate.length > 0) {
    await db
      .update(orders)
      .set({ status, updatedAt: now })
      .where(inArray(orders.id, toUpdate.map((row) => row.id)));
  }

  if (toUpdate.length === 1) {
    await logActivity(
      "status_change",
      "order",
      toUpdate[0]!.id,
      orderStatusChangeMessage(
        toUpdate[0]!.invoiceNumber,
        toUpdate[0]!.status,
        status,
        "System"
      ),
      {
        category: "deliveries",
        details: {
          invoiceNumber: toUpdate[0]!.invoiceNumber,
          from: toUpdate[0]!.status,
          to: status,
        },
      }
    );
  } else if (toUpdate.length > 1) {
    const labels = toUpdate
      .map((row) => row.invoiceNumber)
      .sort((a, b) => a.localeCompare(b));
    await logActivity(
      "status_change",
      "order",
      toUpdate[0]!.id,
      options?.linkedGroup
        ? `Linked delivery group (${toUpdate.length} orders) → ${status.replace(/_/g, " ")}: ${labels.join(", ")}`
        : `Bulk status (${toUpdate.length} orders) → ${status.replace(/_/g, " ")}`,
      {
        category: "deliveries",
        details: {
          orderIds: toUpdate.map((row) => row.id),
          invoiceNumbers: labels,
          from: "mixed",
          to: status,
          linkedGroup: options?.linkedGroup ?? false,
        },
      }
    );
  }

  return unique.map((orderId) => {
    const row = rows.find((entry) => entry.id === orderId);
    const changed = Boolean(row && row.status !== status);
    return { orderId, status, changed };
  });
}
