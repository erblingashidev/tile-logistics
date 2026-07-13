/**
 * Central dispatch planning rules — vehicle matching, large tiles, corridors, Prishtinë rounds.
 *
 * Vehicle name patterns (case-insensitive, matched on name + plate):
 * - volvo / crane / krani → crane truck
 * - daf → linehaul
 * - atego (+ bardh/white, verdhe/yellow when distinguishing) → medium trucks
 * - iveco, sprinter → small vans (excluded for large tiles without crane)
 */

import {
  clusterStopsByRegionThenProximity,
  normalizeDispatchRegion,
  orderStopsForRoundTrip,
  type GeoStop,
} from "@/lib/dispatch/route-cluster";
import {
  analyzeOrderCargo,
  isLargeTileFormat,
  LARGE_TILE_SMALL_QTY_MAX_PIECES,
  type TileLineCargo,
} from "@/lib/dispatch/large-tiles";
import {
  type DispatchVehicle,
  estimateRouteCostKm,
  rankVehiclesForLoad,
  vehicleHasCrane,
  isDafTruck,
  DAF_MIN_PALLETS,
  classifyVehicleFamily,
  type VehicleFamily,
} from "@/lib/dispatch/vehicles";
import {
  distanceFromWarehouse,
  distanceKm,
  WAREHOUSE_LOCATION,
} from "@/lib/locations";

/** Prishtinë and nearby municipalities treated as "close" for multi-round deferral. */
const PRISHTINA_REGION_KEYS = new Set([
  "prishtine",
  "prishtina",
  "pristina",
  "fushe kosove",
  "obiliq",
  "lipjan",
  "gracanice",
]);

export interface DispatchPlanningStop extends GeoStop {
  id: number;
  invoiceNumber: string;
  customerName: string;
  location: string;
  city: string;
  region: string;
  totalPallets: number;
  totalWeightKg: number;
  totalPieces: number;
  requiresCrane: boolean;
  hasLargeTiles: boolean;
  largeTilePieces: number;
  customerHasForklift: boolean;
  cargoReasons: string[];
  priority: "normal" | "urgent";
}

export interface DispatchCargoProfile {
  requiresCrane: boolean;
  hasLargeTiles: boolean;
  largeTilePieces: number;
  preferCrane: boolean;
  preferAtego: boolean;
  excludeIvecoSprinter: boolean;
  customerHasForklift: boolean;
  reasons: string[];
}

/** Max km between stops when merging cross-municipality corridor routes (e.g. Gjakovë + Prizren). */
export const CORRIDOR_CLUSTER_MAX_SPREAD_KM = 95;

function normalizeRegionKey(value?: string | null): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function isPrishtinaArea(stop: { region?: string; city?: string }): boolean {
  const key = normalizeRegionKey(stop.region || stop.city);
  if (PRISHTINA_REGION_KEYS.has(key)) return true;
  const city = normalizeRegionKey(stop.city);
  return PRISHTINA_REGION_KEYS.has(city);
}

export function analyzeDispatchCargo(
  items: TileLineCargo[],
  options?: { customerHasForklift?: boolean; totalPieces?: number }
): DispatchCargoProfile {
  const base = analyzeOrderCargo(items);
  const customerHasForklift = options?.customerHasForklift ?? false;

  let largeTilePieces = 0;
  const reasons = [...base.reasons];

  for (const item of items) {
    const w = item.tileWidthCm ?? 0;
    const h = item.tileHeightCm ?? 0;
    if (w <= 0 || h <= 0 || !isLargeTileFormat(w, h)) continue;
    const pieces =
      item.pieceCount ??
      item.calculatedPieces ??
      (item.quantityM2 ? Math.ceil(item.quantityM2) : 0);
    largeTilePieces += pieces;
  }

  const hasLargeTiles = largeTilePieces > 0;
  const smallLargeTileQty =
    hasLargeTiles && largeTilePieces <= LARGE_TILE_SMALL_QTY_MAX_PIECES;

  let preferCrane = base.requiresCrane;
  let preferAtego = false;
  let excludeIvecoSprinter = false;

  if (hasLargeTiles && !base.requiresCrane) {
    if (smallLargeTileQty) {
      preferAtego = true;
      reasons.push(
        `Large tiles (${largeTilePieces} pcs ≤ ${LARGE_TILE_SMALL_QTY_MAX_PIECES}) — hand unload, prefer Atego`
      );
    } else if (customerHasForklift) {
      excludeIvecoSprinter = true;
      reasons.push(
        "Large tiles + customer forklift — Atego/DAF/Volvo OK; exclude Iveco & Sprinter"
      );
    } else {
      preferCrane = true;
      reasons.push(
        "Large tiles (>120×120 cm) without forklift — prefer Volvo crane truck"
      );
    }
  }

  if (customerHasForklift && hasLargeTiles) {
    reasons.push("Customer has working forklift on site");
  }

  return {
    requiresCrane: base.requiresCrane,
    hasLargeTiles,
    largeTilePieces,
    preferCrane,
    preferAtego,
    excludeIvecoSprinter,
    customerHasForklift,
    reasons,
  };
}

function vehicleBlockedForCargo(
  vehicle: DispatchVehicle,
  cargo: DispatchCargoProfile
): boolean {
  const family = classifyVehicleFamily(vehicle);

  if (cargo.requiresCrane && !vehicle.hasCrane) return true;
  if (cargo.requiresCrane) return false;

  if (cargo.preferCrane && !vehicle.hasCrane) return true;

  if (cargo.excludeIvecoSprinter && (family === "iveco" || family === "sprinter")) {
    return true;
  }

  if (cargo.hasLargeTiles && !cargo.customerHasForklift && !cargo.preferAtego) {
    if (family === "iveco" || family === "sprinter") return true;
  }

  return false;
}

function vehiclePreferenceScore(
  vehicle: DispatchVehicle,
  cargo: DispatchCargoProfile,
  pallets: number
): number {
  const family = classifyVehicleFamily(vehicle);
  let score = 0;

  if (cargo.preferCrane && family === "volvo_crane") score += 200;
  if (cargo.preferAtego && family === "atego") score += 150;
  if (cargo.hasLargeTiles && family === "volvo_crane" && !cargo.preferAtego) {
    score += 80;
  }

  if (family === "daf" && pallets >= DAF_MIN_PALLETS) score += 40;
  if (family === "daf" && pallets < DAF_MIN_PALLETS) score -= 30;

  if (family === "sprinter" || family === "iveco") score -= 10;
  score -= vehicle.costPerKm * 5;
  score -= Math.max(0, vehicle.maxPallets - vehicle.usedPallets - pallets);

  return score;
}

export function rankVehiclesForDispatch(
  fleet: DispatchVehicle[],
  pallets: number,
  weightKg: number,
  cargo: DispatchCargoProfile,
  options?: { allowDafBelowMin?: boolean }
): DispatchVehicle[] {
  const requiresCrane = cargo.requiresCrane || cargo.preferCrane;
  const base = rankVehiclesForLoad(
    fleet,
    pallets,
    weightKg,
    requiresCrane,
    options
  );

  const filtered = base.filter((v) => !vehicleBlockedForCargo(v, cargo));
  if (filtered.length === 0 && !requiresCrane) {
    const fallback = rankVehiclesForLoad(fleet, pallets, weightKg, false, {
      allowDafBelowMin: true,
    }).filter((v) => !vehicleBlockedForCargo(v, cargo));
    return fallback.sort(
      (a, b) =>
        vehiclePreferenceScore(b, cargo, pallets) -
        vehiclePreferenceScore(a, cargo, pallets)
    );
  }

  return filtered.sort((a, b) => {
    const pref = vehiclePreferenceScore(b, cargo, pallets) - vehiclePreferenceScore(a, cargo, pallets);
    if (pref !== 0) return pref;
    if (a.maxPallets !== b.maxPallets) return a.maxPallets - b.maxPallets;
    return a.costPerKm - b.costPerKm;
  });
}

function groupSpreadKm(group: GeoStop[]): number {
  if (group.length < 2) return 0;
  let max = 0;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      max = Math.max(max, distanceKm(group[i], group[j]));
    }
  }
  return max;
}

function estimateSeparateTripsKm(groups: GeoStop[][]): number {
  return groups.reduce((sum, group) => {
    if (group.length === 0) return sum;
    const ordered = orderStopsForRoundTrip(group);
    const { totalKm } = estimateRouteCostKm(
      { costPerKm: 1 } as DispatchVehicle,
      ordered.map((s) => ({ lat: s.lat, lng: s.lng }))
    );
    return sum + totalKm;
  }, 0);
}

function estimateCombinedTripKm(group: GeoStop[]): number {
  if (group.length === 0) return 0;
  const ordered = orderStopsForRoundTrip(group);
  const { totalKm } = estimateRouteCostKm(
    { costPerKm: 1 } as DispatchVehicle,
    ordered.map((s) => ({ lat: s.lat, lng: s.lng }))
  );
  return totalKm;
}

/**
 * After region clustering, merge adjacent corridor groups when one truck beats two
 * separate warehouse runs (e.g. Gjakovë + Prizren).
 */
export function mergeCorridorClusters<T extends GeoStop & { totalPallets?: number }>(
  groups: T[][],
  options: { maxOrders: number; maxSpreadKm?: number }
): T[][] {
  const maxSpread = options.maxSpreadKm ?? CORRIDOR_CLUSTER_MAX_SPREAD_KM;
  let merged = groups.map((g) => [...g]);
  let changed = true;

  while (changed) {
    changed = false;
    outer: for (let i = 0; i < merged.length; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        const a = merged[i];
        const b = merged[j];
        const combined = [...a, ...b];
        if (combined.length > options.maxOrders) continue;
        if (groupSpreadKm(combined) > maxSpread) continue;

        const craneFlags = new Set(combined.map((s) => !!s.requiresCrane));
        if (craneFlags.size > 1) continue;

        const separateKm = estimateSeparateTripsKm([a, b]);
        const combinedKm = estimateCombinedTripKm(combined);
        if (combinedKm >= separateKm * 0.92) continue;

        merged = merged.filter((_, idx) => idx !== i && idx !== j);
        merged.push(combined);
        changed = true;
        break outer;
      }
    }
  }

  return merged;
}

export function clusterStopsForDispatch<T extends GeoStop & { totalPallets?: number }>(
  stops: T[],
  options: {
    maxOrders: number;
    maxDistanceKm: number;
    regionMaxDistanceKm?: number;
  }
): T[][] {
  const regionGroups = clusterStopsByRegionThenProximity(stops, {
    maxOrders: options.maxOrders,
    maxDistanceKm: options.maxDistanceKm,
    mergeDistanceKm: options.maxDistanceKm + 5,
    regionMaxDistanceKm: options.regionMaxDistanceKm ?? Math.max(options.maxDistanceKm, 45),
  });

  return mergeCorridorClusters(regionGroups, {
    maxOrders: options.maxOrders,
  });
}

export function describeRouteCluster(stops: Array<{ city?: string; region?: string }>): string {
  const labels = [
    ...new Set(
      stops
        .map((s) => s.city || s.region || "")
        .filter(Boolean)
    ),
  ];
  return labels.length > 0 ? labels.join(" · ") : "Route cluster";
}

/** Sort groups: farther from warehouse first (round 1), Prishtinë deferred when mixed. */
export function sortGroupsForRoundPlanning<T extends GeoStop>(
  groups: T[][],
  deliveryRound: number
): T[][] {
  return [...groups].sort((a, b) => {
    const distA = Math.max(...a.map((s) => distanceFromWarehouse(s)));
    const distB = Math.max(...b.map((s) => distanceFromWarehouse(s)));
    const prA = a.every((s) => isPrishtinaArea(s));
    const prB = b.every((s) => isPrishtinaArea(s));

    if (deliveryRound === 1) {
      if (prA && !prB) return 1;
      if (!prA && prB) return -1;
    }

    return distB - distA;
  });
}

/** Keep all Prishtinë orders on one truck per round when they fit together. */
export function mergePrishtinaGroups<T extends GeoStop & { totalPallets?: number }>(
  groups: T[][],
  maxOrders: number
): T[][] {
  const prishtinaStops = groups
    .flat()
    .filter((s) => isPrishtinaArea(s));
  if (prishtinaStops.length < 2) return groups;

  const nonPr = groups.filter((g) => !g.every((s) => isPrishtinaArea(s)));
  const prOnly = groups.filter((g) => g.every((s) => isPrishtinaArea(s)));
  if (prOnly.length <= 1) return groups;

  const combined = prOnly.flat();
  if (combined.length > maxOrders) return groups;
  if (groupSpreadKm(combined) > 45) return groups;

  return [...nonPr, combined];
}

export function suggestTruckForCluster(
  fleet: DispatchVehicle[],
  group: DispatchPlanningStop[],
  cargo: DispatchCargoProfile
): DispatchVehicle | null {
  const pallets = group.reduce((s, o) => s + o.totalPallets, 0);
  const weight = group.reduce((s, o) => s + o.totalWeightKg, 0);
  const ranked = rankVehiclesForDispatch(fleet, pallets, weight, cargo);
  return ranked[0] ?? null;
}

export function warehouseDistanceKm(stop: { lat: number; lng: number }): number {
  return distanceKm(WAREHOUSE_LOCATION, stop);
}

export function vehicleFamilyLabel(family: VehicleFamily): string {
  switch (family) {
    case "volvo_crane":
      return "Volvo crane";
    case "daf":
      return "DAF linehaul";
    case "atego":
      return "Atego";
    case "iveco":
      return "Iveco";
    case "sprinter":
      return "Sprinter";
    default:
      return "Truck";
  }
}

export type { VehicleFamily } from "@/lib/dispatch/vehicles";
export {
  classifyVehicleFamily,
  isVolvoCrane,
  isAtegoTruck,
  isExcludedSmallVan,
  isDafLinehaul,
} from "@/lib/dispatch/vehicles";
