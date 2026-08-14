import { and, eq, inArray } from "drizzle-orm";
import type { ManualOrderStatus, OrderStatus } from "@/lib/constants";
import { getDb } from "@/lib/db";
import { dbAll, dbOne } from "@/lib/db/query";
import { deliveryProofs, orders } from "@/lib/db/schema";
import { manualStatusFromOrder } from "@/lib/manual-order-status-display";
import { getLinkedOrderIdGroup } from "@/lib/services/order-delivery-links";
import {
  deleteDeliveryProofsForOrder,
  deleteDeliveryProofsForOrders,
  submitAdminDeliveryProof,
} from "@/lib/services/delivery-proofs";
import { getOrderStaff } from "@/lib/services/employees";
import { getOrderLoadStatus } from "@/lib/services/load-coordination";
import {
  updateOrderStatus,
  updateOrderStatusBatch,
} from "@/lib/services/order-status";
import {
  applyRetroactiveOrderAttribution,
  applyRetroactiveOrderAttributionBatch,
  getOrder,
} from "@/lib/services/orders";

export { manualStatusFromOrder };

async function markOrderManuallyPrepared(orderId: number) {
  const order = await getOrder(orderId);
  if (!order) return { ok: false as const, error: "Order not found" };

  const loadStatus = await getOrderLoadStatus(orderId);
  await updateOrderStatus(orderId, "assigned");

  if (loadStatus.prepStatus === "prepared") {
    return { ok: true as const, orderId, status: "prepared" as const, changed: false };
  }

  const staff = await getOrderStaff(orderId);
  const actorId =
    staff.picker?.employeeId ??
    staff.groupLeader?.employeeId ??
    staff.staff?.find((s) => s.role === "unloader")?.employeeId ??
    staff.driver?.employeeId;

  if (actorId) {
    const proof = await submitAdminDeliveryProof({
      orderId,
      phase: "prepared",
      employeeId: actorId,
      force: true,
    });
    if (!proof.ok) {
      return { ok: false as const, error: proof.error };
    }
  }

  return { ok: true as const, orderId, status: "prepared" as const, changed: true };
}

async function getOrdersDeliveredState(
  orderIds: number[]
): Promise<Map<number, boolean>> {
  const map = new Map<number, boolean>();
  if (orderIds.length === 0) return map;

  const db = await getDb();
  const rows = await dbAll(
    db
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(inArray(orders.id, orderIds))
  );
  const deliveredProofs = await dbAll(
    db
      .select({ orderId: deliveryProofs.orderId })
      .from(deliveryProofs)
      .where(
        and(
          inArray(deliveryProofs.orderId, orderIds),
          eq(deliveryProofs.phase, "delivered")
        )
      )
  );
  const proofSet = new Set(deliveredProofs.map((row) => row.orderId));

  for (const row of rows) {
    map.set(
      row.id,
      row.status === "delivered" || proofSet.has(row.id)
    );
  }
  return map;
}

export async function updateManualOrderStatus(input: {
  orderId: number;
  status: ManualOrderStatus;
  applyToLinked?: boolean;
  vehicleId?: number;
  pickerId?: number;
}) {
  const applyToLinked = input.applyToLinked !== false;
  const hasAttribution =
    input.vehicleId != null ||
    (input.pickerId != null && input.pickerId > 0);

  if (input.status === "prepared") {
    if (hasAttribution) {
      const attribution = await applyRetroactiveOrderAttribution({
        orderId: input.orderId,
        vehicleId: input.vehicleId,
        deliveryRound: 1,
        pickerId: input.pickerId,
      });
      if (!attribution.ok) return attribution;
    }
    return markOrderManuallyPrepared(input.orderId);
  }

  const orderStatus = input.status as OrderStatus;
  const db = await getDb();
  const anchor = await dbOne(
    db
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(eq(orders.id, input.orderId))
  );
  if (!anchor) return { ok: false as const, error: "Order not found" };

  const anchorDeliveredState = await getOrdersDeliveredState([input.orderId]);
  const anchorWasDelivered = anchorDeliveredState.get(input.orderId) ?? false;
  const revertingFromDelivered =
    anchorWasDelivered && input.status !== "delivered";

  const useLinkedGroup =
    applyToLinked &&
    (input.status === "delivered" || revertingFromDelivered);

  const targetIds = useLinkedGroup
    ? await getLinkedOrderIdGroup(input.orderId)
    : [input.orderId];

  const deliveredState = await getOrdersDeliveredState(targetIds);

  if (hasAttribution) {
    const attribution =
      targetIds.length > 1
        ? await applyRetroactiveOrderAttributionBatch({
            orderIds: targetIds,
            vehicleId: input.vehicleId,
            deliveryRound: 1,
            pickerId: input.pickerId,
          })
        : await applyRetroactiveOrderAttribution({
            orderId: input.orderId,
            vehicleId: input.vehicleId,
            deliveryRound: 1,
            pickerId: input.pickerId,
          });
    if (!attribution.ok) return attribution;
  }

  if (orderStatus === "pending") {
    const idsToClear = targetIds.filter((id) => deliveredState.get(id));
    if (idsToClear.length > 1) {
      await deleteDeliveryProofsForOrders(idsToClear);
    } else if (idsToClear.length === 1) {
      await deleteDeliveryProofsForOrder(idsToClear[0]!);
    }
  }

  if (targetIds.length > 1) {
    const results = await updateOrderStatusBatch(targetIds, orderStatus, {
      linkedGroup: true,
    });
    if (results.length !== targetIds.length) {
      return { ok: false as const, error: "Order not found" };
    }
  } else {
    const result = await updateOrderStatus(input.orderId, orderStatus);
    if (!result) return { ok: false as const, error: "Order not found" };
  }

  return {
    ok: true as const,
    orderId: input.orderId,
    status: input.status,
    updatedOrderIds: targetIds,
    linked: targetIds.length > 1,
  };
}
