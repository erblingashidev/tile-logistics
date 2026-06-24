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
