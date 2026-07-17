import type { DeliveryProofPhase } from "@/lib/constants";

export type OrderDisplayStage =
  | "pending"
  | "assigned"
  | "prepared"
  | "loaded"
  | "not_loaded"
  | "in_transit"
  | "arrived"
  | "partially_delivered"
  | "delivered"
  | "cancelled";

export const ORDER_STAGE_LABELS: Record<OrderDisplayStage, string> = {
  pending: "Open",
  assigned: "Assigned",
  prepared: "Prepared",
  loaded: "Loaded on truck",
  not_loaded: "Not loaded",
  in_transit: "On the way",
  arrived: "Arrived",
  partially_delivered: "Partially delivered",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** Left-border + background tints for order lists (admin + portal). */
export function orderListRowClass(stage: OrderDisplayStage): string {
  switch (stage) {
    case "delivered":
    case "arrived":
      return "bg-green-50/95 border-l-4 border-l-green-500";
    case "partially_delivered":
      return "bg-orange-50/95 border-l-4 border-l-orange-500";
    case "in_transit":
      return "bg-indigo-50/95 border-l-4 border-l-indigo-500";
    case "loaded":
      return "bg-cyan-50/95 border-l-4 border-l-cyan-500";
    case "prepared":
      return "bg-sky-50/95 border-l-4 border-l-sky-400";
    case "assigned":
      return "bg-amber-50/95 border-l-4 border-l-amber-400";
    case "not_loaded":
      return "bg-red-50/80 border-l-4 border-l-red-400";
    case "cancelled":
      return "bg-zinc-100/90 border-l-4 border-l-zinc-400";
    default:
      return "bg-white border-l-4 border-l-zinc-200";
  }
}

export const ORDER_STAGE_LEGEND: Array<{
  stage: OrderDisplayStage;
  label: string;
  swatchClass: string;
}> = [
  { stage: "pending", label: "Open", swatchClass: "bg-white ring-1 ring-zinc-300" },
  {
    stage: "assigned",
    label: "Assigned",
    swatchClass: "bg-amber-200 ring-1 ring-amber-400",
  },
  {
    stage: "prepared",
    label: "Prepared",
    swatchClass: "bg-sky-200 ring-1 ring-sky-400",
  },
  {
    stage: "loaded",
    label: "Loaded on truck",
    swatchClass: "bg-cyan-200 ring-1 ring-cyan-500",
  },
  {
    stage: "in_transit",
    label: "On the way",
    swatchClass: "bg-indigo-200 ring-1 ring-indigo-400",
  },
  {
    stage: "delivered",
    label: "Delivered",
    swatchClass: "bg-green-200 ring-1 ring-green-400",
  },
  {
    stage: "partially_delivered",
    label: "Partial",
    swatchClass: "bg-orange-200 ring-1 ring-orange-400",
  },
  {
    stage: "not_loaded",
    label: "Not loaded",
    swatchClass: "bg-red-200 ring-1 ring-red-400",
  },
];

export function orderStageBadgeTone(
  stage: OrderDisplayStage
): "green" | "amber" | "slate" | "red" | "blue" {
  if (stage === "arrived" || stage === "delivered") return "green";
  if (stage === "partially_delivered") return "amber";
  if (stage === "loaded") return "blue";
  if (stage === "prepared") return "blue";
  if (stage === "assigned" || stage === "in_transit") return "amber";
  if (stage === "cancelled" || stage === "not_loaded") return "red";
  return "slate";
}

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
  if (phases.has("prepared")) return "prepared";
  if (status === "partially_delivered" || phases.has("partial_delivery")) {
    return "partially_delivered";
  }
  if (status === "assigned") return "assigned";
  if (status === "pending") return "pending";
  return "pending";
}

const WAITING_STAGES = new Set<OrderDisplayStage>([
  "pending",
  "assigned",
  "prepared",
  "loaded",
  "not_loaded",
  "partially_delivered",
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
    "prepared",
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
