import type { ManualOrderStatus, OrderStatus } from "@/lib/constants";
import { manualStatusFromOrder } from "@/lib/manual-order-status-display";
import { getLinkedOrderIdGroup } from "@/lib/services/order-delivery-links";
import { submitAdminDeliveryProof } from "@/lib/services/delivery-proofs";
import { getOrderStaff } from "@/lib/services/employees";
import { getOrderLoadStatus } from "@/lib/services/load-coordination";
import { updateOrderStatus } from "@/lib/services/order-status";
import {
  applyRetroactiveOrderAttribution,
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
  const targetIds =
    input.status === "delivered" && applyToLinked
      ? await getLinkedOrderIdGroup(input.orderId)
      : [input.orderId];

  const updatedOrderIds: number[] = [];
  for (const id of targetIds) {
    if (hasAttribution) {
      const attribution = await applyRetroactiveOrderAttribution({
        orderId: id,
        vehicleId: input.vehicleId,
        deliveryRound: 1,
        pickerId: input.pickerId,
      });
      if (!attribution.ok) return attribution;
    }

    const result = await updateOrderStatus(id, orderStatus);
    if (!result) return { ok: false as const, error: "Order not found" };
    updatedOrderIds.push(id);
  }

  return {
    ok: true as const,
    orderId: input.orderId,
    status: input.status,
    updatedOrderIds,
    linked: targetIds.length > 1,
  };
}
