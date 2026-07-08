import { eq, or, and, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll, dbOne } from "@/lib/db/query";
import {
  orderDeliveryLinks,
  orders,
  assignments,
  vehicles,
} from "@/lib/db/schema";
import { logActivity } from "@/lib/logger";

export type LinkedOrderSummary = {
  id: number;
  invoiceNumber: string;
  customerName: string;
  location: string;
  assignment: {
    vehicleId: number;
    vehicleName: string;
    deliveryRound: number;
  } | null;
};

function pairIds(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

async function getOrderAssignmentSummary(orderId: number) {
  const db = await getDb();
  const row = await dbOne(
    db
      .select({
        vehicleId: assignments.vehicleId,
        vehicleName: vehicles.name,
        deliveryRound: assignments.deliveryRound,
      })
      .from(assignments)
      .innerJoin(vehicles, eq(assignments.vehicleId, vehicles.id))
      .where(eq(assignments.orderId, orderId))
  );
  if (!row) return null;
  return {
    vehicleId: row.vehicleId,
    vehicleName: row.vehicleName,
    deliveryRound: row.deliveryRound,
  };
}

async function orderSummary(orderId: number): Promise<LinkedOrderSummary | null> {
  const db = await getDb();
  const row = await dbOne(
    db
      .select({
        id: orders.id,
        invoiceNumber: orders.invoiceNumber,
        customerName: orders.customerName,
        location: orders.location,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
  );
  if (!row) return null;
  return {
    ...row,
    assignment: await getOrderAssignmentSummary(orderId),
  };
}

export async function listLinkedOrders(orderId: number): Promise<LinkedOrderSummary[]> {
  const db = await getDb();
  const links = await dbAll(
    db
      .select()
      .from(orderDeliveryLinks)
      .where(
        or(
          eq(orderDeliveryLinks.orderIdA, orderId),
          eq(orderDeliveryLinks.orderIdB, orderId)
        )
      )
  );

  const partnerIds = links.map((link) =>
    link.orderIdA === orderId ? link.orderIdB : link.orderIdA
  );
  const uniqueIds = [...new Set(partnerIds)];
  const summaries: LinkedOrderSummary[] = [];
  for (const id of uniqueIds) {
    const summary = await orderSummary(id);
    if (summary) summaries.push(summary);
  }
  return summaries.sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber));
}

/** Batch-load linked orders for list views. */
export async function getDeliveryLinksByOrderIds(orderIds: number[]) {
  const map = new Map<number, LinkedOrderSummary[]>();
  if (orderIds.length === 0) return map;

  const db = await getDb();
  const links = await dbAll(
    db
      .select()
      .from(orderDeliveryLinks)
      .where(
        or(
          inArray(orderDeliveryLinks.orderIdA, orderIds),
          inArray(orderDeliveryLinks.orderIdB, orderIds)
        )
      )
  );

  const partnerIds = new Set<number>();
  const adjacency = new Map<number, Set<number>>();

  for (const link of links) {
    partnerIds.add(link.orderIdA);
    partnerIds.add(link.orderIdB);
    if (!adjacency.has(link.orderIdA)) adjacency.set(link.orderIdA, new Set());
    if (!adjacency.has(link.orderIdB)) adjacency.set(link.orderIdB, new Set());
    adjacency.get(link.orderIdA)!.add(link.orderIdB);
    adjacency.get(link.orderIdB)!.add(link.orderIdA);
  }

  const summaryById = new Map<number, LinkedOrderSummary>();
  for (const id of partnerIds) {
    const summary = await orderSummary(id);
    if (summary) summaryById.set(id, summary);
  }

  for (const orderId of orderIds) {
    const partners = adjacency.get(orderId);
    if (!partners || partners.size === 0) continue;
    const linked = [...partners]
      .map((id) => summaryById.get(id))
      .filter((row): row is LinkedOrderSummary => Boolean(row))
      .sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber));
    if (linked.length > 0) map.set(orderId, linked);
  }

  return map;
}

async function upsertDeliveryLink(
  orderIdA: number,
  orderIdB: number,
  note?: string | null
) {
  const [a, b] = pairIds(orderIdA, orderIdB);
  const db = await getDb();
  const now = new Date().toISOString();
  const existing = await dbOne(
    db
      .select({ id: orderDeliveryLinks.id })
      .from(orderDeliveryLinks)
      .where(
        and(
          eq(orderDeliveryLinks.orderIdA, a),
          eq(orderDeliveryLinks.orderIdB, b)
        )
      )
  );

  if (existing) {
    if (note?.trim()) {
      await db
        .update(orderDeliveryLinks)
        .set({ note: note.trim() })
        .where(eq(orderDeliveryLinks.id, existing.id));
    }
    return existing.id;
  }

  const inserted = await dbOne(
    db
      .insert(orderDeliveryLinks)
      .values({
        orderIdA: a,
        orderIdB: b,
        note: note?.trim() || null,
        createdAt: now,
      })
      .returning({ id: orderDeliveryLinks.id })
  );
  return inserted!.id;
}

export async function linkOrdersForSameDelivery(
  orderIds: number[],
  note?: string
) {
  const unique = [...new Set(orderIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (unique.length < 2) {
    throw new Error("Select at least two orders");
  }

  const db = await getDb();
  const existing = await dbAll(
    db
      .select({ id: orders.id, invoiceNumber: orders.invoiceNumber })
      .from(orders)
      .where(inArray(orders.id, unique))
  );
  if (existing.length !== unique.length) {
    throw new Error("One or more selected orders were not found");
  }

  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      await upsertDeliveryLink(unique[i]!, unique[j]!, note);
    }
  }

  const labels = existing
    .map((row) => row.invoiceNumber)
    .sort((a, b) => a.localeCompare(b));
  await logActivity(
    "link_delivery",
    "order",
    unique[0],
    `Linked delivery: ${labels.join(", ")}`,
    {
      category: "orders",
      details: { orderIds: unique, invoiceNumbers: labels, note: note?.trim() || null },
    }
  );

  return { linkedOrderIds: unique, invoiceNumbers: labels };
}

export async function unlinkOrders(orderIdA: number, orderIdB: number) {
  const [a, b] = pairIds(orderIdA, orderIdB);
  const db = await getDb();
  const row = await dbOne(
    db
      .select()
      .from(orderDeliveryLinks)
      .where(
        and(
          eq(orderDeliveryLinks.orderIdA, a),
          eq(orderDeliveryLinks.orderIdB, b)
        )
      )
  );
  if (!row) return false;

  await db.delete(orderDeliveryLinks).where(eq(orderDeliveryLinks.id, row.id));

  const left = await orderSummary(a);
  const right = await orderSummary(b);
  await logActivity(
    "unlink_delivery",
    "order",
    a,
    `Unlinked delivery group: ${left?.invoiceNumber ?? a} ↔ ${right?.invoiceNumber ?? b}`,
    {
      category: "orders",
      details: {
        orderIdA: a,
        orderIdB: b,
        invoiceNumbers: [left?.invoiceNumber, right?.invoiceNumber].filter(Boolean),
      },
    }
  );
  return true;
}

export async function unlinkOrdersInSelection(orderIds: number[]) {
  const unique = [...new Set(orderIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (unique.length < 2) {
    throw new Error("Select at least two linked orders to unlink");
  }

  let removed = 0;
  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      if (await unlinkOrders(unique[i]!, unique[j]!)) removed += 1;
    }
  }
  if (removed === 0) {
    throw new Error("No delivery link exists between the selected orders");
  }
  return { removed };
}

export async function getLinkedTruckConflictMessage(
  orderId: number,
  vehicleId: number
): Promise<string | undefined> {
  const self = await orderSummary(orderId);
  const linked = await listLinkedOrders(orderId);
  const conflicts = linked.filter(
    (partner) =>
      partner.assignment && partner.assignment.vehicleId !== vehicleId
  );
  if (conflicts.length === 0) return undefined;

  const partnerText = conflicts
    .map(
      (partner) =>
        `${partner.invoiceNumber} (${partner.customerName}) on ${partner.assignment!.vehicleName}`
    )
    .join("; ");

  return `${self?.invoiceNumber ?? "Order"} is linked with ${partnerText}. Assign to a different truck?`;
}

export async function getLinkedSplitReminder(
  orderId: number
): Promise<string | undefined> {
  const linked = await listLinkedOrders(orderId);
  if (linked.length === 0) return undefined;

  const selfAssignment = await getOrderAssignmentSummary(orderId);
  const unassigned = linked.filter((partner) => !partner.assignment);
  const otherTrucks = linked.filter(
    (partner) =>
      partner.assignment &&
      selfAssignment &&
      partner.assignment.vehicleId !== selfAssignment.vehicleId
  );

  if (unassigned.length > 0) {
    return `Linked: ${unassigned.map((p) => p.invoiceNumber).join(", ")} not assigned.`;
  }
  if (otherTrucks.length > 0) {
    return `Linked orders split: ${otherTrucks.map((p) => `${p.invoiceNumber} → ${p.assignment!.vehicleName}`).join("; ")}.`;
  }
  return undefined;
}

export async function getBulkLinkedConflictMessage(
  orderIds: number[],
  targetVehicleId: number
): Promise<string | undefined> {
  const batch = new Set(orderIds);
  const messages = new Set<string>();

  for (const orderId of orderIds) {
    const self = await orderSummary(orderId);
    if (!self) continue;
    const linked = await listLinkedOrders(orderId);

    for (const partner of linked) {
      if (batch.has(partner.id)) continue;

      if (
        partner.assignment &&
        partner.assignment.vehicleId !== targetVehicleId
      ) {
        messages.add(
          `${self.invoiceNumber} is linked with ${partner.invoiceNumber}, already on ${partner.assignment.vehicleName}`
        );
        continue;
      }

      if (!partner.assignment) {
        messages.add(
          `${self.invoiceNumber} is linked with ${partner.invoiceNumber}, which is not on this truck`
        );
      }
    }
  }

  if (messages.size === 0) return undefined;
  return `${[...messages].join(". ")}. Proceed with separate trucks?`;
}
