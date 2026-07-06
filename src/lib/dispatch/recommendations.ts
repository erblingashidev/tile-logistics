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
  clusterStopsByRegionThenProximity,
  orderStopsForRoundTrip,
  normalizeDispatchRegion,
  type GeoStop,
} from "@/lib/dispatch/route-cluster";
import { checkVehicleCapacity } from "@/lib/calculations";
import { listOrders, getVehicleLoad } from "@/lib/services/orders";
import { getDriverForVehicle } from "@/lib/services/employees";
import { analyzeOrderCargo } from "@/lib/dispatch/large-tiles";
import { isOrderReadyToShip } from "@/lib/delivery-schedule";
import { isOrderUrgent } from "@/lib/order-priority";
import { recommendUrgentPlacement } from "@/lib/dispatch/urgent-routing";
import { pickerOnTruckRound } from "@/lib/dispatch/picker-resolution";
import {
  type DispatchVehicle,
  estimateRouteCostKm,
  rankVehiclesForLoad,
  vehicleCostPerKm,
  vehicleHasCrane,
  DAF_MIN_PALLETS,
  explainNoStandardTruckCapacity,
} from "@/lib/dispatch/vehicles";

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
  requiresCrane: boolean;
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

async function pickerWorkload(pickerId: number): Promise<number> {
  const db = await getDb();
  const row = await dbOne(
    db
      .select({ count: sql<number>`count(*)` })
      .from(orderEmployeeAssignments)
      .innerJoin(orders, eq(orderEmployeeAssignments.orderId, orders.id))
      .where(
        and(
          eq(orderEmployeeAssignments.employeeId, pickerId),
          eq(orderEmployeeAssignments.role, "picker"),
          sql`${orders.status} NOT IN ('delivered', 'cancelled')`
        )
      )
  );
  return row?.count ?? 0;
}

async function resolvePicker(
  vehicleId: number,
  deliveryRound: number
): Promise<{ id: number | null; name: string | null }> {
  const onRoute = await pickerOnTruckRound(vehicleId, deliveryRound);
  if (onRoute) return onRoute;

  const db = await getDb();

  const rows = await dbAll(
    db
      .select({
        id: employees.id,
        name: employees.name,
        status: employees.status,
        roles: employees.roles,
      })
      .from(employees)
  );

  const pickers = rows
    .filter((e) => {
      try {
        return (JSON.parse(e.roles) as string[]).includes("picker");
      } catch {
        return false;
      }
    })
    .filter((e) => e.status !== "off_duty");

  const withWorkload = await Promise.all(
    pickers.map(async (e) => ({
      ...e,
      workload: await pickerWorkload(e.id),
    }))
  );
  withWorkload.sort((a, b) => a.workload - b.workload);

  if (withWorkload.length === 0) return { id: null, name: null };

  const preferred = withWorkload[0];
  return { id: preferred.id, name: preferred.name };
}

function toStop(
  order: Awaited<ReturnType<typeof listOrders>>[number]
): DispatchOrderStop | null {
  if (!order.lat || !order.lng) return null;
  const cargo = analyzeOrderCargo(order.items ?? []);
  return {
    id: order.id,
    invoiceNumber: order.invoiceNumber,
    customerName: order.customerName,
    location: order.location,
    city: order.city ?? order.region ?? "",
    region: order.region ?? order.city ?? "",
    lat: order.lat,
    lng: order.lng,
    totalPallets: order.totalPallets,
    totalWeightKg: order.totalWeightKg,
    totalM2: order.totalM2,
    requiresCrane: cargo.requiresCrane,
    cargoReasons: cargo.reasons,
    priority: isOrderUrgent(order) ? "urgent" : "normal",
  };
}

function clusterOrders(
  stops: DispatchOrderStop[],
  maxOrders: number,
  maxDistanceKm: number
): DispatchOrderStop[][] {
  return clusterStopsByRegionThenProximity(
    stops.map((s) => ({ ...s, totalPallets: s.totalPallets })),
    {
      maxOrders,
      maxDistanceKm,
      mergeDistanceKm: maxDistanceKm + 5,
      regionMaxDistanceKm: Math.max(maxDistanceKm, 45),
    }
  ) as DispatchOrderStop[][];
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
  fleet: DispatchVehicle[]
): Promise<DispatchRecommendation | null> {
  const totalPallets = group.reduce((s, o) => s + o.totalPallets, 0);
  const totalWeightKg = group.reduce((s, o) => s + o.totalWeightKg, 0);
  const requiresCrane = group.some((o) => o.requiresCrane);

  const ranked = rankVehiclesForLoad(
    fleet,
    totalPallets,
    totalWeightKg,
    requiresCrane
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

  const picker = await resolvePicker(pick.id, deliveryRound);
  const driver = await getDriverForVehicle(pick.id);

  const reasons: string[] = [];
  if (requiresCrane) {
    reasons.push("Crane truck — jumbo tiles with >2 pieces");
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
      `${group.length} stops in ${regionLabel} — same area, one truck (no mixed-region run)`
    );
  } else if (group[0]?.region) {
    reasons.push(`Delivery area: ${group[0].region}`);
  }
  reasons.push(`~${totalKm} km round trip · cost score ${costScore}`);
  if (picker.name) {
    reasons.push(`Picker ${picker.name} (truck default / workload)`);
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
    (pick.hasCrane && !requiresCrane ? -50 : 0);

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
    reasons,
    warnings,
  };
}

function remainingLabel(v: DispatchVehicle, load: number): number {
  return Math.max(0, v.maxPallets - v.usedPallets - load);
}

function rankTrucksForGroup(
  fleet: DispatchVehicle[],
  totalPallets: number,
  totalWeightKg: number,
  requiresCrane: boolean
) {
  let ranked = rankVehiclesForLoad(
    fleet,
    totalPallets,
    totalWeightKg,
    requiresCrane
  );
  if (ranked.length === 0 && !requiresCrane) {
    ranked = rankVehiclesForLoad(fleet, totalPallets, totalWeightKg, false, {
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
  skipped: DispatchPlan["skipped"]
): Promise<DispatchVehicle[]> {
  const totalPallets = group.reduce((s, o) => s + o.totalPallets, 0);
  const totalWeightKg = group.reduce((s, o) => s + o.totalWeightKg, 0);
  const requiresCrane = group.some((o) => o.requiresCrane);

  const ranked = rankTrucksForGroup(
    fleet,
    totalPallets,
    totalWeightKg,
    requiresCrane
  );

  if (ranked.length === 0 && group.length > 1) {
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

  const rec = await buildRecommendation(group, ranked[0], deliveryRound, fleet);
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

export async function generateDispatchPlan(options?: {
  deliveryRound?: number;
  maxOrdersPerRoute?: number;
  maxDistanceKm?: number;
  region?: string;
}): Promise<DispatchPlan> {
  const deliveryRound = options?.deliveryRound ?? 1;
  const maxOrders = Math.min(8, options?.maxOrdersPerRoute ?? 6);
  const maxDistanceKm = options?.maxDistanceKm ?? 30;

  let fleet = await loadDispatchVehicles(deliveryRound);
  const rawOrders = await listOrders({
    unassigned: true,
    readyToShip: true,
    region: options?.region,
  });

  const stops: DispatchOrderStop[] = [];
  const skipped: DispatchPlan["skipped"] = [];

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

  const craneStops = stops.filter((s) => s.requiresCrane);
  let standardStops = stops.filter((s) => !s.requiresCrane);
  const plannedUrgentIds = new Set<number>();

  const recommendations: DispatchRecommendation[] = [];

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
    const rec = await buildRecommendation([stop], vehicle, deliveryRound, fleet);
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
      fleet
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

  const standardGroups = clusterOrders(standardStops, maxOrders, maxDistanceKm)
    .sort((a, b) => {
      const palletsA = a.reduce((s, o) => s + o.totalPallets, 0);
      const palletsB = b.reduce((s, o) => s + o.totalPallets, 0);
      if (palletsB !== palletsA) return palletsB - palletsA;
      return b.length - a.length;
    });

  for (const group of standardGroups) {
    fleet = await planStandardGroup(
      group,
      fleet,
      deliveryRound,
      recommendations,
      skipped
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
  const requiresCrane = stop.requiresCrane;
  const ranked = rankTrucksForGroup(
    fleet,
    stop.totalPallets,
    stop.totalWeightKg,
    requiresCrane
  );
  if (ranked.length === 0) {
    return {
      ok: false as const,
      error: requiresCrane
        ? "Crane truck required but none available with capacity"
        : "No truck with capacity",
    };
  }

  const rec = await buildRecommendation([stop], ranked[0], deliveryRound, fleet);
  if (!rec) return { ok: false as const, error: "Could not build recommendation" };
  return { ok: true as const, recommendation: rec };
}
