import type { DeliveryProofPhase } from "@/lib/constants";

export type OrderDisplayStage =
  | "pending"
  | "assigned"
  | "loaded"
  | "not_loaded"
  | "in_transit"
  | "arrived"
  | "delivered"
  | "cancelled";

export const ORDER_STAGE_LABELS: Record<OrderDisplayStage, string> = {
  pending: "Pending",
  assigned: "Assigned",
  loaded: "Loaded at warehouse",
  not_loaded: "Not loaded (explained)",
  in_transit: "On the way",
  arrived: "Arrived",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** Combines DB status + employee proof steps for admin list display. */
export function computeOrderDisplayStage(
  status: string,
  proofPhases: string[]
): OrderDisplayStage {
  const phases = new Set(proofPhases);
  if (status === "cancelled") return "cancelled";
  if (status === "delivered" || phases.has("delivered")) return "delivered";
  if (phases.has("arrived")) return "arrived";
  if (status === "in_transit" || phases.has("departed")) return "in_transit";
  if (phases.has("load_skipped")) return "not_loaded";
  if (phases.has("loaded")) return "loaded";
  if (status === "assigned") return "assigned";
  if (status === "pending") return "pending";
  return "pending";
}

export function orderListRowClass(stage: OrderDisplayStage): string {
  if (stage === "arrived" || stage === "delivered") {
    return "bg-green-50/90 border-l-4 border-l-green-500";
  }
  if (stage === "assigned" || stage === "in_transit" || stage === "loaded") {
    return "bg-amber-50/90 border-l-4 border-l-amber-400";
  }
  if (stage === "not_loaded") {
    return "bg-red-50/60 border-l-4 border-l-red-300";
  }
  return "border-l-4 border-l-transparent";
}

export function orderStageBadgeTone(
  stage: OrderDisplayStage
): "green" | "amber" | "slate" | "red" {
  if (stage === "arrived" || stage === "delivered") return "green";
  if (stage === "assigned" || stage === "in_transit" || stage === "loaded") {
    return "amber";
  }
  if (stage === "cancelled") return "red";
  if (stage === "not_loaded") return "red";
  return "slate";
}

const WAITING_STAGES = new Set<OrderDisplayStage>([
  "pending",
  "assigned",
  "loaded",
  "not_loaded",
]);

const ON_THE_WAY_STAGES = new Set<OrderDisplayStage>([
  "in_transit",
  "arrived",
]);

export function isOrderWaitingToSend(stage: OrderDisplayStage): boolean {
  return WAITING_STAGES.has(stage);
}

export function isOrderOnTheWay(stage: OrderDisplayStage): boolean {
  return ON_THE_WAY_STAGES.has(stage);
}

export function salesQueueCounts(
  orders: Array<{ deliveryStage?: OrderDisplayStage }>
) {
  let waiting = 0;
  let onTheWay = 0;
  let delivered = 0;
  let cancelled = 0;

  for (const order of orders) {
    const stage = order.deliveryStage ?? "pending";
    if (stage === "delivered") delivered += 1;
    else if (stage === "cancelled") cancelled += 1;
    else if (isOrderOnTheWay(stage)) onTheWay += 1;
    else if (isOrderWaitingToSend(stage)) waiting += 1;
  }

  return { waiting, onTheWay, delivered, cancelled, active: waiting + onTheWay };
}

export function latestProofPhase(
  proofPhases: DeliveryProofPhase[]
): DeliveryProofPhase | null {
  const order: DeliveryProofPhase[] = [
    "loaded",
    "departed",
    "arrived",
    "delivered",
  ];
  let latest: DeliveryProofPhase | null = null;
  const set = new Set(proofPhases);
  for (const p of order) {
    if (set.has(p)) latest = p;
  }
  return latest;
}
