import { eq, and, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll, dbOne } from "@/lib/db/query";
import {
  employees,
  orderEmployeeAssignments,
  orders,
  vehicles,
} from "@/lib/db/schema";
import {
  orderStopsForRoundTrip,
  normalizeDispatchRegion,
} from "@/lib/dispatch/route-cluster";
import { checkVehicleCapacity } from "@/lib/calculations";
import { listOrders, getVehicleLoad } from "@/lib/services/orders";
import { getDriverForVehicle } from "@/lib/services/employees";
import { isOrderReadyToShip } from "@/lib/delivery-schedule";
import { isOrderUrgent } from "@/lib/order-priority";
import { resolveOrderGeo } from "@/lib/locations";
import { recommendUrgentPlacement } from "@/lib/dispatch/urgent-routing";
import {
  pickerOnTruckRound,
  resolvePickerForTruck,
  type PickerAssignmentContext,
} from "@/lib/dispatch/picker-resolution";
import {
  type DispatchVehicle,
  estimateRouteCostKm,
  vehicleHasCrane,
  vehicleCostPerKm,
  DAF_MIN_PALLETS,
  explainNoStandardTruckCapacity,
} from "@/lib/dispatch/vehicles";
import {
  analyzeDispatchCargo,
  clusterStopsForDispatch,
  describeRouteCluster,
  mergePrishtinaGroups,
  rankVehiclesForDispatch,
  sortGroupsForRoundPlanning,
  isPrishtinaArea,
  type DispatchCargoProfile,
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
  requiresCrane: boolean;
  hasLargeTiles: boolean;
  customerHasForklift: boolean;
  cargoReasons: string[];
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
  hasCrane: boolean;
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
}

export interface DispatchPlan {
  deliveryRound: number;
  recommendations: DispatchRecommendation[];
  skipped: Array<{ orderId: number; invoiceNumber: string; reason: string }>;
  summary: {
    totalOrders: number;
    plannedOrders: number;
    craneRoutes: number;
    estimatedTotalKm: number;
    estimatedCostScore: number;
  };
}

export interface FullDayDispatchPlan {
  rounds: DispatchPlan[];
  summary: {
    totalOrders: number;
    plannedOrders: number;
    craneRoutes: number;
    estimatedTotalKm: number;
    estimatedCostScore: number;
  };
}

async function loadDispatchVehicles(deliveryRound: number): Promise<DispatchVehicle[]> {
  const db = await getDb();
  const rows = await dbAll(db.select().from(vehicles));
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
        hasCrane: vehicleHasCrane(v),
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
  order: Awaited<ReturnType<typeof listOrders>>[number]
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
  const cargo = analyzeDispatchCargo(order.items ?? [], {
    customerHasForklift: Boolean(order.customerHasForklift),
    totalPieces: order.totalPieces,
  });
  return {
    id: order.id,
    invoiceNumber: order.invoiceNumber,
    customerName: order.customerName,
    location: order.location,
    city: order.city ?? geo.city,
    region: order.region ?? geo.region,
    lat: geo.lat,
    lng: geo.lng,
    totalPallets: order.totalPallets,
    totalWeightKg: order.totalWeightKg,
    totalM2: order.totalM2,
    totalPieces: order.totalPieces,
    requiresCrane: cargo.requiresCrane,
    hasLargeTiles: cargo.hasLargeTiles,
    customerHasForklift: cargo.customerHasForklift,
    cargoReasons: cargo.reasons,
    priority: isOrderUrgent(order) ? "urgent" : "normal",
  };
}

function groupCargoProfile(
  group: DispatchOrderStop[],
  orderItems?: Awaited<ReturnType<typeof listOrders>>[number]["items"]
): DispatchCargoProfile {
  if (group.length === 1 && orderItems) {
    return analyzeDispatchCargo(orderItems, {
      customerHasForklift: group[0].customerHasForklift,
      totalPieces: group[0].totalPieces,
    });
  }

  const requiresCrane = group.some((o) => o.requiresCrane);
  const preferCrane = group.some((o) =>
    o.cargoReasons.some((r) => r.includes("without forklift"))
  );
  const preferAtego = group.some((o) =>
    o.cargoReasons.some((r) => r.includes("hand unload"))
  );
  const hasLargeTiles = group.some((o) => o.hasLargeTiles);
  const customerHasForklift = group.some((o) => o.customerHasForklift);
  const reasons = [...new Set(group.flatMap((o) => o.cargoReasons))];

  return {
    requiresCrane,
    hasLargeTiles,
    largeTilePieces: 0,
    preferCrane: preferCrane || (hasLargeTiles && !customerHasForklift && !preferAtego),
    preferAtego,
    excludeIvecoSprinter:
      hasLargeTiles && customerHasForklift && !requiresCrane,
    customerHasForklift,
    reasons,
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
  fleet: DispatchVehicle[],
  pickerCtx?: PickerAssignmentContext
): Promise<DispatchRecommendation | null> {
  const totalPallets = group.reduce((s, o) => s + o.totalPallets, 0);
  const totalWeightKg = group.reduce((s, o) => s + o.totalWeightKg, 0);
  const cargo = groupCargoProfile(group);

  const ranked = rankVehiclesForDispatch(
    fleet,
    totalPallets,
    totalWeightKg,
    cargo
  );
  const pick = ranked.find((v) => v.id === vehicle.id) ?? ranked[0];
  if (!pick) return null;

  const check = checkVehicleCapacity(
    [{ totalPallets: pick.usedPallets, totalWeightKg: pick.usedWeightKg, totalM2: 0, totalPieces: 0, totalTruckPalletSlots: pick.usedPallets }],
    { totalPallets, totalWeightKg, totalM2: 0, totalPieces: 0, totalTruckPalletSlots: totalPallets },
    pick.maxPallets,
    pick.maxWeightKg
  );
  if (!check.palletsOk) return null;

  const orderedStops = orderStopsForRoundTrip(group);
  const { totalKm, costScore } = estimateRouteCostKm(
    pick,
    orderedStops.map((g) => ({ lat: g.lat, lng: g.lng }))
  );

  const picker = await resolvePicker(
    pick.id,
    deliveryRound,
    pickerCtx,
    group.length
  );
  const driver = await getDriverForVehicle(pick.id);
  const routeCluster = describeRouteCluster(group);

  const reasons: string[] = [];
  if (cargo.requiresCrane || cargo.preferCrane) {
    reasons.push("Crane / Volvo truck — large or jumbo tiles");
  } else if (cargo.preferAtego) {
    reasons.push("Small large-tile qty — prefer Atego (hand unload)");
  } else {
    const dafNote =
      pick.name.toLowerCase().includes("daf") && totalPallets >= DAF_MIN_PALLETS
        ? " — linehaul truck for larger load"
        : "";
    reasons.push(
      `Best-fit ${pick.name} (${remainingLabel(pick, totalPallets)} pallets left after load)${dafNote}`
    );
  }
  if (group.length > 1) {
    const regionLabel = [
      ...new Set(group.map((o) => normalizeDispatchRegion(o))),
    ].join(" · ");
    reasons.push(
      `${group.length} stops in ${regionLabel} — corridor cluster, one truck`
    );
  } else if (group[0]?.region) {
    reasons.push(`Delivery area: ${group[0].region}`);
  }
  reasons.push(`~${totalKm} km round trip · cost score ${costScore}`);
  if (picker.name) {
    reasons.push(`Picker ${picker.name} — one picker per truck, balanced load`);
  }
  if (driver?.name) {
    reasons.push(`Driver ${driver.name} from truck link`);
  }

  const warnings: string[] = [];
  if (!check.weightOk) warnings.push(check.weightWarning ?? "Weight advisory");
  for (const o of group) {
    warnings.push(...o.cargoReasons.filter((r) => r.includes("OK on standard")));
  }

  const score =
    1000 -
    costScore * 10 -
    totalKm * 2 +
    (group.length > 1 ? group.length * 30 : 0) +
    (pick.hasCrane && !cargo.requiresCrane ? -50 : 0);

  return {
    id: `rec-${pick.id}-r${deliveryRound}-${group.map((o) => o.id).join("-")}`,
    deliveryRound,
    orderIds: group.map((o) => o.id),
    orders: group,
    vehicleId: pick.id,
    vehicleName: pick.name,
    plateNumber: pick.plateNumber,
    hasCrane: pick.hasCrane,
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
  };
}

function remainingLabel(v: DispatchVehicle, load: number): number {
  return Math.max(0, v.maxPallets - v.usedPallets - load);
}

function rankTrucksForGroup(
  fleet: DispatchVehicle[],
  group: DispatchOrderStop[],
  items?: Awaited<ReturnType<typeof listOrders>>[number]["items"]
) {
  const totalPallets = group.reduce((s, o) => s + o.totalPallets, 0);
  const totalWeightKg = group.reduce((s, o) => s + o.totalWeightKg, 0);
  const cargo = groupCargoProfile(group, items);
  let ranked = rankVehiclesForDispatch(fleet, totalPallets, totalWeightKg, cargo);
  if (ranked.length === 0 && !cargo.requiresCrane && !cargo.preferCrane) {
    ranked = rankVehiclesForDispatch(fleet, totalPallets, totalWeightKg, cargo, {
      allowDafBelowMin: true,
    });
  }
  return ranked;
}

async function planStandardGroup(
  group: DispatchOrderStop[],
  fleet: DispatchVehicle[],
  deliveryRound: number,
  recommendations: DispatchRecommendation[],
  skipped: DispatchPlan["skipped"],
  pickerCtx?: PickerAssignmentContext
): Promise<DispatchVehicle[]> {
  const totalPallets = group.reduce((s, o) => s + o.totalPallets, 0);
  const ranked = rankTrucksForGroup(fleet, group);

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
    const reason = explainNoStandardTruckCapacity(fleet, totalPallets);
    for (const o of group) {
      skipped.push({
        orderId: o.id,
        invoiceNumber: o.invoiceNumber,
        reason,
      });
    }
    return fleet;
  }

  const rec = await buildRecommendation(
    group,
    ranked[0],
    deliveryRound,
    fleet,
    pickerCtx
  );
  if (!rec) {
    if (group.length > 1) {
      for (const stop of group) {
        fleet = await planStandardGroup(
          [stop],
          fleet,
          deliveryRound,
          recommendations,
          skipped
        );
      }
      return fleet;
    }
    for (const o of group) {
      skipped.push({
        orderId: o.id,
        invoiceNumber: o.invoiceNumber,
        reason: "Could not fit on available trucks",
      });
    }
    return fleet;
  }

  if (
    rec.vehicleName.toLowerCase().includes("daf") &&
    totalPallets < DAF_MIN_PALLETS
  ) {
    rec.warnings.push(
      `DAF used as fallback — only truck with ${totalPallets} plt space left this round`
    );
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

function filterStopsForRound(
  stops: DispatchOrderStop[],
  deliveryRound: number,
  hasFartherPending: boolean
): DispatchOrderStop[] {
  if (deliveryRound === 1 && hasFartherPending) {
    const prishtina = stops.filter((s) => isPrishtinaArea(s));
    const farther = stops.filter((s) => !isPrishtinaArea(s));
    if (farther.length > 0 && prishtina.length > 0) {
      return farther;
    }
  }
  return stops;
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
      const stop = toStop(o);
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

  const hasFartherPending = stops.some((s) => !isPrishtinaArea(s));
  const roundStops = filterStopsForRound(stops, deliveryRound, hasFartherPending);
  const deferredPrishtina = stops.filter(
    (s) => !roundStops.some((r) => r.id === s.id)
  );

  for (const s of deferredPrishtina) {
    skipped.push({
      orderId: s.id,
      invoiceNumber: s.invoiceNumber,
      reason: `Prishtinë area — defer to round ${deliveryRound + 1} while farther routes go first`,
    });
  }

  const craneStops = roundStops.filter((s) => s.requiresCrane);
  let standardStops = roundStops.filter((s) => !s.requiresCrane);
  const plannedUrgentIds = new Set<number>();

  const recommendations: DispatchRecommendation[] = [];
  const pickerCtx: PickerAssignmentContext = {
    truckPicker: new Map(),
    plannedOrders: new Map(),
  };

  for (const stop of standardStops.filter((s) => s.priority === "urgent")) {
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
    if (best.deliveryRound !== deliveryRound) {
      skipped.push({
        orderId: stop.id,
        invoiceNumber: stop.invoiceNumber,
        reason: `Urgent: best fit is ${best.vehicleName} · round ${best.deliveryRound} (see Dispatch board)`,
      });
      continue;
    }
    const vehicle = fleet.find((v) => v.id === best.vehicleId);
    if (!vehicle) continue;
    const rec = await buildRecommendation([stop], vehicle, deliveryRound, fleet, pickerCtx);
    if (!rec) {
      skipped.push({
        orderId: stop.id,
        invoiceNumber: stop.invoiceNumber,
        reason: "Urgent: no capacity on suggested truck",
      });
      continue;
    }
    rec.reasons = [`Urgent — ${best.reasons[0]}`, ...rec.reasons];
    if (best.almostReady) {
      rec.warnings.push("Adds to truck almost ready to leave");
    }
    recommendations.push(rec);
    plannedUrgentIds.add(stop.id);
    const idx = fleet.findIndex((v) => v.id === rec.vehicleId);
    if (idx >= 0) {
      fleet[idx] = simulateVehicleAfterAssign(
        fleet[idx],
        rec.totalPallets,
        rec.totalWeightKg
      );
    }
  }

  standardStops = standardStops.filter((s) => !plannedUrgentIds.has(s.id));

  for (const stop of craneStops) {
    const rec = await buildRecommendation(
      [stop],
      fleet.find((v) => v.hasCrane) ?? fleet[0],
      deliveryRound,
      fleet,
      pickerCtx
    );
    if (!rec) {
      skipped.push({
        orderId: stop.id,
        invoiceNumber: stop.invoiceNumber,
        reason: "No crane truck capacity for this load",
      });
      continue;
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
  }

  let standardGroups = clusterStopsForDispatch(standardStops, {
    maxOrders,
    maxDistanceKm,
    regionMaxDistanceKm: Math.max(maxDistanceKm, 45),
  });
  standardGroups = mergePrishtinaGroups(standardGroups, maxOrders);
  standardGroups = sortGroupsForRoundPlanning(standardGroups, deliveryRound);

  for (const group of standardGroups) {
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
      craneRoutes: recommendations.filter((r) => r.hasCrane).length,
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
}): Promise<FullDayDispatchPlan> {
  const maxRounds = Math.min(MAX_DELIVERY_ROUNDS, options?.maxRounds ?? 3);
  const rawOrders = await listOrders({
    unassigned: true,
    readyToShip: true,
    region: options?.region,
  });

  const allStops: DispatchOrderStop[] = [];
  const globalSkipped: DispatchPlan["skipped"] = [];

  for (const o of rawOrders) {
    const stop = toStop(o);
    if (!stop) {
      globalSkipped.push({
        orderId: o.id,
        invoiceNumber: o.invoiceNumber,
        reason: "Missing map coordinates — set location on order",
      });
      continue;
    }
    allStops.push(stop);
  }

  const rounds: DispatchPlan[] = [];
  let remaining = [...allStops];

  for (let round = 1; round <= maxRounds && remaining.length > 0; round++) {
    const plan = await generateDispatchPlan({
      deliveryRound: round,
      maxOrdersPerRoute: options?.maxOrdersPerRoute,
      maxDistanceKm: options?.maxDistanceKm,
      region: options?.region,
      stops: remaining,
    });

    const plannedIds = new Set(plan.recommendations.flatMap((r) => r.orderIds));
    remaining = remaining.filter((s) => !plannedIds.has(s.id));

    const roundSkipped = plan.skipped.filter(
      (s) =>
        s.reason.includes("defer to round") &&
        round < maxRounds
    );
    const keptSkipped = plan.skipped.filter(
      (s) => !s.reason.includes("defer to round") || round >= maxRounds
    );

    if (roundSkipped.length > 0 && round < maxRounds) {
      const deferredIds = new Set(roundSkipped.map((s) => s.orderId));
      remaining = [
        ...remaining,
        ...allStops.filter((s) => deferredIds.has(s.id)),
      ];
    }

    rounds.push({
      ...plan,
      skipped: [...keptSkipped, ...globalSkipped.filter(() => round === 1)],
    });
  }

  if (remaining.length > 0) {
    const last = rounds[rounds.length - 1];
    if (last) {
      for (const s of remaining) {
        last.skipped.push({
          orderId: s.id,
          invoiceNumber: s.invoiceNumber,
          reason: "Could not plan in available rounds",
        });
      }
    }
  }

  const allRecs = rounds.flatMap((r) => r.recommendations);
  const plannedIds = new Set(allRecs.flatMap((r) => r.orderIds));

  return {
    rounds,
    summary: {
      totalOrders: allStops.length,
      plannedOrders: plannedIds.size,
      craneRoutes: allRecs.filter((r) => r.hasCrane).length,
      estimatedTotalKm: allRecs.reduce((s, r) => s + r.estimatedKm, 0),
      estimatedCostScore: allRecs.reduce((s, r) => s + r.costScore, 0),
    },
  };
}

export async function recommendOrderAssignment(orderId: number, deliveryRound = 1) {
  const order = (await listOrders()).find((o) => o.id === orderId);
  if (!order) return { ok: false as const, error: "Order not found" };
  if (order.assignment) {
    return { ok: false as const, error: "Order already assigned" };
  }
  if (!isOrderReadyToShip(order)) {
    return {
      ok: false as const,
      error: order.requestedDeliveryDate
        ? `Scheduled for ${order.requestedDeliveryDate} — not ready to ship yet`
        : "Order is not ready to ship yet",
    };
  }
  const stop = toStop(order);
  if (!stop) {
    return { ok: false as const, error: "Order needs a mapped delivery location" };
  }

  const fleet = await loadDispatchVehicles(deliveryRound);
  const ranked = rankTrucksForGroup(fleet, [stop], order.items ?? []);
  if (ranked.length === 0) {
    const cargo = groupCargoProfile([stop]);
    return {
      ok: false as const,
      error:
        cargo.requiresCrane || cargo.preferCrane
          ? "Crane truck required but none available with capacity"
          : "No truck with capacity",
    };
  }

  const rec = await buildRecommendation(
    [stop],
    ranked[0],
    deliveryRound,
    fleet,
    { truckPicker: new Map(), plannedOrders: new Map() }
  );
  if (!rec) return { ok: false as const, error: "Could not build recommendation" };
  return { ok: true as const, recommendation: rec };
}
