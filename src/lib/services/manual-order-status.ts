import type { ManualOrderStatus, OrderStatus } from "@/lib/constants";
import { manualStatusFromOrder } from "@/lib/manual-order-status-display";
import { getLinkedOrderIdGroup } from "@/lib/services/order-delivery-links";
import { deleteDeliveryProofsForOrder, submitAdminDeliveryProof } from "@/lib/services/delivery-proofs";
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

function orderWasDelivered(order: {
  status: string;
  proofs?: Array<{ phase: string }>;
}): boolean {
  return (
    order.status === "delivered" ||
    Boolean(order.proofs?.some((proof) => proof.phase === "delivered"))
  );
}

async function applyManualStatusToOrder(
  orderId: number,
  orderStatus: OrderStatus,
  options: { clearProofsIfRevert: boolean }
) {
  if (options.clearProofsIfRevert) {
    await deleteDeliveryProofsForOrder(orderId);
  }
  return updateOrderStatus(orderId, orderStatus);
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
  const currentOrder = await getOrder(input.orderId);
  if (!currentOrder) return { ok: false as const, error: "Order not found" };

  const revertingFromDelivered =
    orderWasDelivered(currentOrder) && input.status !== "delivered";

  const useLinkedGroup =
    applyToLinked &&
    (input.status === "delivered" || revertingFromDelivered);

  const targetIds = useLinkedGroup
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

    const targetOrder = id === input.orderId ? currentOrder : await getOrder(id);
    if (!targetOrder) return { ok: false as const, error: "Order not found" };

    const clearProofsIfRevert =
      input.status === "pending" && orderWasDelivered(targetOrder);

    const result = await applyManualStatusToOrder(id, orderStatus, {
      clearProofsIfRevert,
    });
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
