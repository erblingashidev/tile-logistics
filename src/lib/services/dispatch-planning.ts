/**
 * Dispatch geography helpers — cluster nearby stops, merge same-city groups.
 * Truck choice is capacity-only (see vehicles.ts / recommendations.ts).
 * Tile/crane rules are intentionally not used; set preferredTruckId on the order instead.
 */

import {
  clusterStopsByRegionThenProximity,
  normalizeDispatchRegion,
  orderStopsForRoundTrip,
  type GeoStop,
} from "@/lib/dispatch/route-cluster";
import {
  type DispatchVehicle,
  estimateRouteCostKm,
  rankVehiclesForLoad,
} from "@/lib/dispatch/vehicles";
import { distanceFromWarehouse, distanceKm } from "@/lib/locations";

/** Max km between stops when merging cross-municipality corridor routes. */
export const CORRIDOR_CLUSTER_MAX_SPREAD_KM = 95;

/** Same municipality max spread when merging split clusters into one truck. */
export const SAME_CITY_MERGE_MAX_SPREAD_KM = 45;

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

/** Sort groups farther from warehouse first so distant runs get trucks earlier. */
export function sortGroupsForRoundPlanning<T extends GeoStop>(groups: T[][]): T[][] {
  return [...groups].sort((a, b) => {
    const distA = Math.max(...a.map((s) => distanceFromWarehouse(s)));
    const distB = Math.max(...b.map((s) => distanceFromWarehouse(s)));
    return distB - distA;
  });
}

/**
 * Merge multiple route groups that share the same municipality when they fit
 * on one truck (don't send two trucks to one city).
 */
export function mergeSameCityGroups<T extends GeoStop & { totalPallets?: number }>(
  groups: T[][],
  maxOrders: number,
  maxSpreadKm = SAME_CITY_MERGE_MAX_SPREAD_KM
): T[][] {
  const byRegion = new Map<string, T[][]>();

  for (const group of groups) {
    const regions = [...new Set(group.map((s) => normalizeDispatchRegion(s)))];
    if (regions.length !== 1) {
      byRegion.set(`__mixed__:${group.map((s) => s.id).join("-")}`, [group]);
      continue;
    }
    const key = regions[0];
    const list = byRegion.get(key) ?? [];
    list.push(group);
    byRegion.set(key, list);
  }

  const merged: T[][] = [];
  for (const [, regionGroups] of byRegion) {
    if (regionGroups.length <= 1) {
      merged.push(...regionGroups);
      continue;
    }

    const combined = regionGroups.flat();
    if (combined.length <= maxOrders && groupSpreadKm(combined) <= maxSpreadKm) {
      merged.push(combined);
    } else {
      merged.push(...regionGroups);
    }
  }

  return merged;
}

export function suggestTruckForCluster(
  fleet: DispatchVehicle[],
  group: Array<{ totalPallets: number; totalWeightKg: number }>
): DispatchVehicle | null {
  const pallets = group.reduce((s, o) => s + o.totalPallets, 0);
  const weight = group.reduce((s, o) => s + o.totalWeightKg, 0);
  return rankVehiclesForLoad(fleet, pallets, weight)[0] ?? null;
}

export { normalizeDispatchRegion };
