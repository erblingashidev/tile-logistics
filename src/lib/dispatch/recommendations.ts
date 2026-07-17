import { getDb } from "@/lib/db";
import { dbAll } from "@/lib/db/query";
import { vehicles } from "@/lib/db/schema";
import {
  orderStopsForRoundTrip,
  normalizeDispatchRegion,
} from "@/lib/dispatch/route-cluster";
import { checkVehicleCapacity } from "@/lib/calculations";
import { listOrders, getVehicleLoad } from "@/lib/services/orders";
import { isTransportVehicle } from "@/lib/services/vehicles";
import { getDriverForVehicle } from "@/lib/services/employees";
import { isOrderUrgent } from "@/lib/order-priority";
import { resolveOrderGeo } from "@/lib/locations";
import { recommendUrgentPlacement } from "@/lib/dispatch/urgent-routing";
import {
  resolvePickerForTruck,
  type PickerAssignmentContext,
} from "@/lib/dispatch/picker-resolution";
import {
  type DispatchVehicle,
  estimateRouteCostKm,
  vehicleCostPerKm,
  rankVehiclesForLoad,
  explainNoTruckCapacity,
} from "@/lib/dispatch/vehicles";
import {
  clusterStopsForDispatch,
  describeRouteCluster,
  mergeSameCityGroups,
  sortGroupsForRoundPlanning,
} from "@/lib/services/dispatch-planning";
import { MAX_DELIVERY_ROUNDS } from "@/lib/constants";

export interface DispatchOrderStop {
  id: number;
  invoiceNumber: string;
  customerName: string;
  location: string;
  city: string;
  region: string;
  lat: number;
  lng: number;
  totalPallets: number;
  totalWeightKg: number;
  totalM2: number;
  totalPieces: number;
  preferredTruckId: number | null;
  preferredTruckName: string | null;
  priority: "normal" | "urgent";
}

export interface DispatchRecommendation {
  id: string;
  deliveryRound: number;
  orderIds: number[];
  orders: DispatchOrderStop[];
  vehicleId: number;
  vehicleName: string;
  plateNumber: string;
  pickerId: number | null;
  pickerName: string | null;
  driverId: number | null;
  driverName: string | null;
  totalPallets: number;
  totalWeightKg: number;
  estimatedKm: number;
  costScore: number;
  score: number;
  routeCluster: string;
  reasons: string[];
  warnings: string[];
  preferredTruck: boolean;
}

export interface DispatchPlan {
  deliveryRound: number;
  recommendations: DispatchRecommendation[];
  skipped: Array<{ orderId: number; invoiceNumber: string; reason: string }>;
  summary: {
    totalOrders: number;
    plannedOrders: number;
    preferredTruckRoutes: number;
    estimatedTotalKm: number;
    estimatedCostScore: number;
  };
}

export interface FullDayDispatchPlan {
  rounds: DispatchPlan[];
  summary: {
    totalOrders: number;
    plannedOrders: number;
    preferredTruckRoutes: number;
    estimatedTotalKm: number;
    estimatedCostScore: number;
  };
}

async function loadDispatchVehicles(deliveryRound: number): Promise<DispatchVehicle[]> {
  const db = await getDb();
  const rows = (await dbAll(db.select().from(vehicles))).filter(isTransportVehicle);
  return Promise.all(
    rows.map(async (v) => {
      const load = await getVehicleLoad(v.id, deliveryRound);
      return {
        id: v.id,
        name: v.name,
        plateNumber: v.plateNumber,
        maxPallets: v.maxPallets,
        maxWeightKg: v.maxWeightKg,
        status: v.status,
        notes: v.notes,
        costPerKm: vehicleCostPerKm(v),
        usedPallets: load.totals.pallets,
        usedWeightKg: load.totals.weightKg,
      };
    })
  );
}

async function resolvePicker(
  vehicleId: number,
  deliveryRound: number,
  ctx?: PickerAssignmentContext,
  orderCount = 1
): Promise<{ id: number | null; name: string | null }> {
  return resolvePickerForTruck(vehicleId, deliveryRound, { ctx, orderCount });
}

function toStop(
  order: Awaited<ReturnType<typeof listOrders>>[number],
  truckNameById: Map<number, string>
): DispatchOrderStop | null {
  const geo = resolveOrderGeo({
    location: order.location,
    locationId: order.locationId,
    city: order.city,
    region: order.region,
    lat: order.lat,
    lng: order.lng,
  });
  if (!geo) return null;
  const preferredTruckId = order.preferredTruckId ?? null;
  const shipment =
    "shipment" in order && order.shipment
      ? order.shipment
      : null;
  const pallets = shipment?.remaining.pallets ?? order.totalPallets;
  const m2 = shipment?.remaining.m2 ?? order.totalM2;
  const pieces = shipment?.remaining.pieces ?? order.totalPieces;
  const weightKg =
    order.totalPallets > 0
      ? (pallets / order.totalPallets) * order.totalWeightKg
      : order.totalWeightKg;
  return {
    id: order.id,
    invoiceNumber: order.invoiceNumber,
    customerName: order.customerName,
    location: order.location,
    city: order.city ?? geo.city,
    region: order.region ?? geo.region,
    lat: geo.lat,
    lng: geo.lng,
    totalPallets: pallets,
    totalWeightKg: weightKg,
    totalM2: m2,
    totalPieces: pieces,
    preferredTruckId,
    preferredTruckName: preferredTruckId
      ? truckNameById.get(preferredTruckId) ?? `Truck #${preferredTruckId}`
      : null,
    priority: isOrderUrgent(order) ? "urgent" : "normal",
  };
}

function simulateVehicleAfterAssign(
  vehicle: DispatchVehicle,
  pallets: number,
  weightKg: number
): DispatchVehicle {
  return {
    ...vehicle,
    usedPallets: vehicle.usedPallets + pallets,
    usedWeightKg: vehicle.usedWeightKg + weightKg,
  };
}

async function buildRecommendation(
  group: DispatchOrderStop[],
  vehicle: DispatchVehicle,
  deliveryRound: number,
  pickerCtx?: PickerAssignmentContext,
  options?: { preferredTruck?: boolean; extraReasons?: string[] }
): Promise<DispatchRecommendation | null> {
  const totalPallets = group.reduce((s, o) => s + o.totalPallets, 0);
  const totalWeightKg = group.reduce((s, o) => s + o.totalWeightKg, 0);

  const check = checkVehicleCapacity(
    [
      {
        totalPallets: vehicle.usedPallets,
        totalWeightKg: vehicle.usedWeightKg,
        totalM2: 0,
        totalPieces: 0,
        totalTruckPalletSlots: vehicle.usedPallets,
      },
    ],
    {
      totalPallets,
      totalWeightKg,
      totalM2: 0,
      totalPieces: 0,
      totalTruckPalletSlots: totalPallets,
    },
    vehicle.maxPallets,
    vehicle.maxWeightKg
  );
  if (!check.palletsOk) return null;

  const orderedStops = orderStopsForRoundTrip(group);
  const { totalKm, costScore } = estimateRouteCostKm(
    vehicle,
    orderedStops.map((g) => ({ lat: g.lat, lng: g.lng }))
  );

  const picker = await resolvePicker(
    vehicle.id,
    deliveryRound,
    pickerCtx,
    group.length
  );
  const driver = await getDriverForVehicle(vehicle.id);
  const routeCluster = describeRouteCluster(group);
  const preferredTruck = Boolean(options?.preferredTruck);

  const reasons: string[] = [...(options?.extraReasons ?? [])];
  if (preferredTruck) {
    reasons.push(`Manual truck preference — ${vehicle.name}`);
  } else if (group.length > 1) {
    const regionLabel = [
      ...new Set(group.map((o) => normalizeDispatchRegion(o))),
    ].join(" · ");
    reasons.push(
      `${group.length} stops in ${regionLabel} — clustered onto one truck`
    );
  } else {
    const left = Math.max(0, vehicle.maxPallets - vehicle.usedPallets - totalPallets);
    reasons.push(
      `Best capacity fit: ${vehicle.name} (${left} pallets left after load)`
    );
  }
  if (group[0]?.region && group.length === 1) {
    reasons.push(`Delivery area: ${group[0].region}`);
  }
  reasons.push(`~${totalKm} km round trip · cost score ${costScore}`);
  if (picker.name) {
    reasons.push(`Picker ${picker.name}`);
  }
  if (driver?.name) {
    reasons.push(`Driver ${driver.name}`);
  }

  const warnings: string[] = [];
  if (!check.weightOk) warnings.push(check.weightWarning ?? "Weight advisory");

  const score =
    1000 -
    costScore * 10 -
    totalKm * 2 +
    (group.length > 1 ? group.length * 30 : 0) +
    (preferredTruck ? 80 : 0);

  return {
    id: `rec-${vehicle.id}-r${deliveryRound}-${group.map((o) => o.id).join("-")}`,
    deliveryRound,
    orderIds: group.map((o) => o.id),
    orders: orderedStops,
    vehicleId: vehicle.id,
    vehicleName: vehicle.name,
    plateNumber: vehicle.plateNumber,
    pickerId: picker.id,
    pickerName: picker.name,
    driverId: driver?.id ?? null,
    driverName: driver?.name ?? null,
    totalPallets,
    totalWeightKg,
    estimatedKm: totalKm,
    costScore,
    score,
    routeCluster,
    reasons,
    warnings,
    preferredTruck,
  };
}

async function planGroupOntoVehicle(
  group: DispatchOrderStop[],
  vehicle: DispatchVehicle,
  fleet: DispatchVehicle[],
  deliveryRound: number,
  recommendations: DispatchRecommendation[],
  skipped: DispatchPlan["skipped"],
  pickerCtx: PickerAssignmentContext,
  options?: { preferredTruck?: boolean; extraReasons?: string[] }
): Promise<DispatchVehicle[]> {
  const rec = await buildRecommendation(
    group,
    vehicle,
    deliveryRound,
    pickerCtx,
    options
  );
  if (!rec) {
    if (group.length > 1) {
      for (const stop of group) {
        fleet = await planGroupOntoVehicle(
          [stop],
          vehicle,
          fleet,
          deliveryRound,
          recommendations,
          skipped,
          pickerCtx,
          options
        );
      }
      return fleet;
    }
    for (const o of group) {
      skipped.push({
        orderId: o.id,
        invoiceNumber: o.invoiceNumber,
        reason: options?.preferredTruck
          ? `${vehicle.name} does not have enough pallet space`
          : "Could not fit on available trucks",
      });
    }
    return fleet;
  }

  recommendations.push(rec);
  const idx = fleet.findIndex((v) => v.id === rec.vehicleId);
  if (idx >= 0) {
    fleet[idx] = simulateVehicleAfterAssign(
      fleet[idx],
      rec.totalPallets,
      rec.totalWeightKg
    );
  }
  return fleet;
}

async function planStandardGroup(
  group: DispatchOrderStop[],
  fleet: DispatchVehicle[],
  deliveryRound: number,
  recommendations: DispatchRecommendation[],
  skipped: DispatchPlan["skipped"],
  pickerCtx: PickerAssignmentContext
): Promise<DispatchVehicle[]> {
  const totalPallets = group.reduce((s, o) => s + o.totalPallets, 0);
  const totalWeightKg = group.reduce((s, o) => s + o.totalWeightKg, 0);
  const ranked = rankVehiclesForLoad(fleet, totalPallets, totalWeightKg);

  if (ranked.length === 0 && group.length > 1) {
    for (const stop of group) {
      fleet = await planStandardGroup(
        [stop],
        fleet,
        deliveryRound,
        recommendations,
        skipped,
        pickerCtx
      );
    }
    return fleet;
  }

  if (ranked.length === 0) {
    const reason = explainNoTruckCapacity(fleet, totalPallets);
    for (const o of group) {
      skipped.push({
        orderId: o.id,
        invoiceNumber: o.invoiceNumber,
        reason,
      });
    }
    return fleet;
  }

  return planGroupOntoVehicle(
    group,
    ranked[0],
    fleet,
    deliveryRound,
    recommendations,
    skipped,
    pickerCtx
  );
}

/**
 * Pack stops that share a preferred truck onto that truck (nearest-neighbor order).
 * Excess stops that don't fit are skipped with a clear reason.
 */
async function planPreferredTruckGroups(
  stops: DispatchOrderStop[],
  fleet: DispatchVehicle[],
  deliveryRound: number,
  recommendations: DispatchRecommendation[],
  skipped: DispatchPlan["skipped"],
  pickerCtx: PickerAssignmentContext
): Promise<{ fleet: DispatchVehicle[]; remaining: DispatchOrderStop[] }> {
  const byTruck = new Map<number, DispatchOrderStop[]>();
  const remaining: DispatchOrderStop[] = [];

  for (const stop of stops) {
    if (stop.preferredTruckId == null) {
      remaining.push(stop);
      continue;
    }
    const list = byTruck.get(stop.preferredTruckId) ?? [];
    list.push(stop);
    byTruck.set(stop.preferredTruckId, list);
  }

  let nextFleet = fleet;

  for (const [truckId, group] of byTruck) {
    const vehicle = nextFleet.find((v) => v.id === truckId);
    if (!vehicle) {
      for (const o of group) {
        skipped.push({
          orderId: o.id,
          invoiceNumber: o.invoiceNumber,
          reason: `Preferred truck #${truckId} not found or not a delivery truck`,
        });
      }
      continue;
    }
    if (vehicle.status !== "available") {
      for (const o of group) {
        skipped.push({
          orderId: o.id,
          invoiceNumber: o.invoiceNumber,
          reason: `Preferred truck ${vehicle.name} is not available`,
        });
      }
      continue;
    }

    const ordered = orderStopsForRoundTrip(group);
    const pack: DispatchOrderStop[] = [];
    let used = vehicle.usedPallets;

    for (const stop of ordered) {
      if (used + stop.totalPallets <= vehicle.maxPallets) {
        pack.push(stop);
        used += stop.totalPallets;
      } else {
        skipped.push({
          orderId: stop.id,
          invoiceNumber: stop.invoiceNumber,
          reason: `Preferred truck ${vehicle.name} is full — free space or change preferred truck on the order`,
        });
      }
    }

    if (pack.length === 0) continue;

    nextFleet = await planGroupOntoVehicle(
      pack,
      vehicle,
      nextFleet,
      deliveryRound,
      recommendations,
      skipped,
      pickerCtx,
      {
        preferredTruck: true,
        extraReasons:
          pack.length > 1
            ? [`${pack.length} orders preferring ${vehicle.name}`]
            : undefined,
      }
    );
  }

  return { fleet: nextFleet, remaining };
}

export async function generateDispatchPlan(options?: {
  deliveryRound?: number;
  maxOrdersPerRoute?: number;
  maxDistanceKm?: number;
  region?: string;
  city?: string;
  stops?: DispatchOrderStop[];
}): Promise<DispatchPlan> {
  const deliveryRound = options?.deliveryRound ?? 1;
  const maxOrders = Math.min(8, options?.maxOrdersPerRoute ?? 6);
  const maxDistanceKm = options?.maxDistanceKm ?? 30;

  let fleet = await loadDispatchVehicles(deliveryRound);
  const truckNameById = new Map(fleet.map((v) => [v.id, v.name]));

  const rawOrders = options?.stops
    ? null
    : await listOrders({
        unassigned: true,
        readyToShip: true,
        region: options?.region,
        city: options?.city,
      });

  const stops: DispatchOrderStop[] = [];
  const skipped: DispatchPlan["skipped"] = [];

  if (options?.stops) {
    stops.push(...options.stops);
  } else if (rawOrders) {
    for (const o of rawOrders) {
      const stop = toStop(o, truckNameById);
      if (!stop) {
        skipped.push({
          orderId: o.id,
          invoiceNumber: o.invoiceNumber,
          reason: "Missing map coordinates — set location on order",
        });
        continue;
      }
      stops.push(stop);
    }
  }

  let remainingStops = [...stops];
  const recommendations: DispatchRecommendation[] = [];
  const pickerCtx: PickerAssignmentContext = {
    truckPicker: new Map(),
    plannedOrders: new Map(),
  };

  // Urgent: try join-nearby / dedicated placement for this round only.
  const plannedUrgentIds = new Set<number>();
  for (const stop of remainingStops.filter((s) => s.priority === "urgent")) {
    if (stop.preferredTruckId != null) continue;

    const placement = await recommendUrgentPlacement(stop.id);
    if (!placement.ok) {
      skipped.push({
        orderId: stop.id,
        invoiceNumber: stop.invoiceNumber,
        reason: placement.error,
      });
      continue;
    }
    const best = placement.options[0];
    if (!best || best.deliveryRound !== deliveryRound) {
      skipped.push({
        orderId: stop.id,
        invoiceNumber: stop.invoiceNumber,
        reason: best
          ? `Urgent: best fit is ${best.vehicleName} · round ${best.deliveryRound} (see Dispatch board)`
          : "Urgent: no placement found",
      });
      continue;
    }
    const vehicle = fleet.find((v) => v.id === best.vehicleId);
    if (!vehicle) continue;

    const before = recommendations.length;
    fleet = await planGroupOntoVehicle(
      [stop],
      vehicle,
      fleet,
      deliveryRound,
      recommendations,
      skipped,
      pickerCtx,
      { extraReasons: [`Urgent — ${best.reasons[0]}`] }
    );
    if (recommendations.length > before) {
      plannedUrgentIds.add(stop.id);
    }
  }

  remainingStops = remainingStops.filter((s) => !plannedUrgentIds.has(s.id));

  // Manual preferred trucks before auto clustering.
  const preferredResult = await planPreferredTruckGroups(
    remainingStops,
    fleet,
    deliveryRound,
    recommendations,
    skipped,
    pickerCtx
  );
  fleet = preferredResult.fleet;
  remainingStops = preferredResult.remaining;

  let groups = clusterStopsForDispatch(remainingStops, {
    maxOrders,
    maxDistanceKm,
    regionMaxDistanceKm: Math.max(maxDistanceKm, 45),
  });
  groups = mergeSameCityGroups(groups, maxOrders);
  groups = sortGroupsForRoundPlanning(groups);

  for (const group of groups) {
    fleet = await planStandardGroup(
      group,
      fleet,
      deliveryRound,
      recommendations,
      skipped,
      pickerCtx
    );
  }

  recommendations.sort((a, b) => b.score - a.score);

  const plannedIds = new Set(recommendations.flatMap((r) => r.orderIds));

  return {
    deliveryRound,
    recommendations,
    skipped,
    summary: {
      totalOrders: stops.length,
      plannedOrders: plannedIds.size,
      preferredTruckRoutes: recommendations.filter((r) => r.preferredTruck).length,
      estimatedTotalKm: recommendations.reduce((s, r) => s + r.estimatedKm, 0),
      estimatedCostScore: recommendations.reduce((s, r) => s + r.costScore, 0),
    },
  };
}

export async function generateFullDayDispatchPlan(options?: {
  maxRounds?: number;
  maxOrdersPerRoute?: number;
  maxDistanceKm?: number;
  region?: string;
  city?: string;
}): Promise<FullDayDispatchPlan> {
  const maxRounds = Math.min(
    MAX_DELIVERY_ROUNDS,
    options?.maxRounds ?? MAX_DELIVERY_ROUNDS
  );

  const first = await generateDispatchPlan({
    deliveryRound: 1,
    maxOrdersPerRoute: options?.maxOrdersPerRoute,
    maxDistanceKm: options?.maxDistanceKm,
    region: options?.region,
    city: options?.city,
  });

  const rounds: DispatchPlan[] = [first];
  let carrySkipped = first.skipped;

  for (let round = 2; round <= maxRounds; round++) {
    const orderIds = carrySkipped.map((s) => s.orderId);
    if (orderIds.length === 0) break;

    const allUnassigned = await listOrders({
      unassigned: true,
      readyToShip: true,
      region: options?.region,
      city: options?.city,
    });
    const fleet = await loadDispatchVehicles(round);
    const truckNameById = new Map(fleet.map((v) => [v.id, v.name]));
    const idSet = new Set(orderIds);
    const stops = allUnassigned
      .filter((o) => idSet.has(o.id))
      .map((o) => toStop(o, truckNameById))
      .filter((s): s is DispatchOrderStop => s != null);

    if (stops.length === 0) break;

    const plan = await generateDispatchPlan({
      deliveryRound: round,
      maxOrdersPerRoute: options?.maxOrdersPerRoute,
      maxDistanceKm: options?.maxDistanceKm,
      stops,
    });
    rounds.push(plan);
    carrySkipped = plan.skipped;
  }

  return {
    rounds,
    summary: {
      totalOrders: first.summary.totalOrders,
      plannedOrders: rounds.reduce((s, r) => s + r.summary.plannedOrders, 0),
      preferredTruckRoutes: rounds.reduce(
        (s, r) => s + r.summary.preferredTruckRoutes,
        0
      ),
      estimatedTotalKm: rounds.reduce(
        (s, r) => s + r.summary.estimatedTotalKm,
        0
      ),
      estimatedCostScore: rounds.reduce(
        (s, r) => s + r.summary.estimatedCostScore,
        0
      ),
    },
  };
}

export async function recommendOrderAssignment(
  orderId: number,
  options?: { deliveryRound?: number }
): Promise<DispatchRecommendation | null> {
  const deliveryRound = options?.deliveryRound ?? 1;
  const orders = await listOrders({ unassigned: true });
  const order = orders.find((o) => o.id === orderId);
  if (!order) return null;

  const fleet = await loadDispatchVehicles(deliveryRound);
  const truckNameById = new Map(fleet.map((v) => [v.id, v.name]));
  const stop = toStop(order, truckNameById);
  if (!stop) return null;

  const plan = await generateDispatchPlan({
    deliveryRound,
    stops: [stop],
  });
  return plan.recommendations[0] ?? null;
}
