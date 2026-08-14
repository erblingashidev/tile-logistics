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
  const idsToLoad = [...partnerIds];
  if (idsToLoad.length > 0) {
    const orderRows = await dbAll(
      db
        .select({
          id: orders.id,
          invoiceNumber: orders.invoiceNumber,
          customerName: orders.customerName,
          location: orders.location,
        })
        .from(orders)
        .where(inArray(orders.id, idsToLoad))
    );
    const assignmentRows = await dbAll(
      db
        .select({
          orderId: assignments.orderId,
          vehicleId: assignments.vehicleId,
          vehicleName: vehicles.name,
          deliveryRound: assignments.deliveryRound,
        })
        .from(assignments)
        .innerJoin(vehicles, eq(assignments.vehicleId, vehicles.id))
        .where(inArray(assignments.orderId, idsToLoad))
    );
    const assignmentByOrderId = new Map<
      number,
      {
        vehicleId: number;
        vehicleName: string;
        deliveryRound: number;
      }
    >();
    for (const row of assignmentRows) {
      if (!assignmentByOrderId.has(row.orderId)) {
        assignmentByOrderId.set(row.orderId, {
          vehicleId: row.vehicleId,
          vehicleName: row.vehicleName,
          deliveryRound: row.deliveryRound,
        });
      }
    }
    for (const row of orderRows) {
      summaryById.set(row.id, {
        ...row,
        assignment: assignmentByOrderId.get(row.id) ?? null,
      });
    }
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

function allDeliveryLinkPairs(orderIds: number[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < orderIds.length; i++) {
    for (let j = i + 1; j < orderIds.length; j++) {
      pairs.push(pairIds(orderIds[i]!, orderIds[j]!));
    }
  }
  return pairs;
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
  const existingOrders = await dbAll(
    db
      .select({ id: orders.id, invoiceNumber: orders.invoiceNumber })
      .from(orders)
      .where(inArray(orders.id, unique))
  );
  if (existingOrders.length !== unique.length) {
    throw new Error("One or more selected orders were not found");
  }

  const pairs = allDeliveryLinkPairs(unique);
  const trimmedNote = note?.trim() || null;
  const now = new Date().toISOString();

  const existingLinks = await dbAll(
    db
      .select({
        id: orderDeliveryLinks.id,
        orderIdA: orderDeliveryLinks.orderIdA,
        orderIdB: orderDeliveryLinks.orderIdB,
      })
      .from(orderDeliveryLinks)
      .where(
        or(
          inArray(orderDeliveryLinks.orderIdA, unique),
          inArray(orderDeliveryLinks.orderIdB, unique)
        )
      )
  );

  const existingByPair = new Map<string, number>();
  for (const link of existingLinks) {
    existingByPair.set(`${link.orderIdA}:${link.orderIdB}`, link.id);
  }

  const toInsert: Array<{
    orderIdA: number;
    orderIdB: number;
    note: string | null;
    createdAt: string;
  }> = [];
  const toUpdateNoteIds: number[] = [];

  for (const [a, b] of pairs) {
    const existingId = existingByPair.get(`${a}:${b}`);
    if (existingId != null) {
      if (trimmedNote) toUpdateNoteIds.push(existingId);
      continue;
    }
    toInsert.push({
      orderIdA: a,
      orderIdB: b,
      note: trimmedNote,
      createdAt: now,
    });
  }

  if (toInsert.length > 0) {
    await db.insert(orderDeliveryLinks).values(toInsert);
  }
  if (trimmedNote && toUpdateNoteIds.length > 0) {
    await db
      .update(orderDeliveryLinks)
      .set({ note: trimmedNote })
      .where(inArray(orderDeliveryLinks.id, toUpdateNoteIds));
  }

  const labels = existingOrders
    .map((row) => row.invoiceNumber)
    .sort((a, b) => a.localeCompare(b));
  await logActivity(
    "link_delivery",
    "order",
    unique[0],
    `Linked delivery: ${labels.join(", ")}`,
    {
      category: "orders",
      details: {
        orderIds: unique,
        invoiceNumbers: labels,
        note: trimmedNote,
        linksAdded: toInsert.length,
      },
    }
  );

  return {
    linkedOrderIds: unique,
    invoiceNumbers: labels,
    linksAdded: toInsert.length,
  };
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

/** All order ids in the same linked-delivery group (including orderId). */
export async function getLinkedOrderIdGroup(orderId: number): Promise<number[]> {
  const db = await getDb();
  const group = new Set<number>([orderId]);
  const queue = [orderId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    const links = await dbAll(
      db
        .select({
          orderIdA: orderDeliveryLinks.orderIdA,
          orderIdB: orderDeliveryLinks.orderIdB,
        })
        .from(orderDeliveryLinks)
        .where(
          or(
            eq(orderDeliveryLinks.orderIdA, id),
            eq(orderDeliveryLinks.orderIdB, id)
          )
        )
    );

    for (const link of links) {
      const neighbor = link.orderIdA === id ? link.orderIdB : link.orderIdA;
      if (!group.has(neighbor)) {
        group.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return [...group].sort((a, b) => a - b);
}

/** Include every order in the same linked-delivery group(s) as the inputs. */
export async function expandOrderIdsWithLinkedGroups(
  orderIds: number[]
): Promise<number[]> {
  const expanded = new Set<number>();
  for (const id of orderIds) {
    if (!Number.isFinite(id) || id <= 0) continue;
    for (const groupId of await getLinkedOrderIdGroup(id)) {
      expanded.add(groupId);
    }
  }
  return [...expanded];
}

/** Remove every delivery link in the group containing orderId (one action). */
export async function unlinkDeliveryGroup(orderId: number) {
  const groupIds = await getLinkedOrderIdGroup(orderId);
  if (groupIds.length < 2) {
    throw new Error("This order is not linked to another delivery");
  }

  const db = await getDb();
  const groupSet = new Set(groupIds);
  const links = await dbAll(
    db
      .select({
        id: orderDeliveryLinks.id,
        orderIdA: orderDeliveryLinks.orderIdA,
        orderIdB: orderDeliveryLinks.orderIdB,
      })
      .from(orderDeliveryLinks)
      .where(
        or(
          inArray(orderDeliveryLinks.orderIdA, groupIds),
          inArray(orderDeliveryLinks.orderIdB, groupIds)
        )
      )
  );

  const linkIds = links
    .filter(
      (link) => groupSet.has(link.orderIdA) && groupSet.has(link.orderIdB)
    )
    .map((link) => link.id);

  if (linkIds.length === 0) {
    throw new Error("No delivery links found for this group");
  }

  await db
    .delete(orderDeliveryLinks)
    .where(inArray(orderDeliveryLinks.id, linkIds));

  const orderRows = await dbAll(
    db
      .select({ id: orders.id, invoiceNumber: orders.invoiceNumber })
      .from(orders)
      .where(inArray(orders.id, groupIds))
  );
  const labels = orderRows
    .map((row) => row.invoiceNumber)
    .sort((a, b) => a.localeCompare(b));

  await logActivity(
    "unlink_delivery",
    "order",
    orderId,
    `Unlinked delivery group: ${labels.join(", ")}`,
    {
      category: "orders",
      details: {
        orderIds: groupIds,
        invoiceNumbers: labels,
        linksRemoved: linkIds.length,
      },
    }
  );

  return {
    removed: linkIds.length,
    orderIds: groupIds,
    invoiceNumbers: labels,
  };
}

export async function unlinkOrdersInSelection(orderIds: number[]) {
  const unique = [...new Set(orderIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (unique.length < 1) {
    throw new Error("Select a linked order to unlink");
  }
  if (unique.length === 1) {
    return unlinkDeliveryGroup(unique[0]!);
  }

  const firstGroup = await getLinkedOrderIdGroup(unique[0]!);
  const groupSet = new Set(firstGroup);
  if (unique.every((id) => groupSet.has(id))) {
    return unlinkDeliveryGroup(unique[0]!);
  }

  if (unique.length < 2) {
    throw new Error("Select a linked order to unlink");
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
  return { removed, orderIds: unique, invoiceNumbers: [] as string[] };
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
