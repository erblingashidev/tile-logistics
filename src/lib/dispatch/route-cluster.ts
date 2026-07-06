import {
  distanceFromWarehouse,
  distanceKm,
  WAREHOUSE_LOCATION,
} from "@/lib/locations";

export interface GeoStop {
  id: number;
  lat: number;
  lng: number;
  requiresCrane?: boolean;
  city?: string;
  region?: string;
}

export interface RouteClusterOptions {
  maxOrders: number;
  /** Max km between any two stops on the same route */
  maxDistanceKm: number;
  /** Slightly wider spread when merging two small routes into one trip */
  mergeDistanceKm?: number;
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

function craneMix(group: GeoStop[], candidate: GeoStop): boolean {
  const groupCrane = group.some((g) => g.requiresCrane);
  return groupCrane !== !!candidate.requiresCrane;
}

function canAddToGroup(
  group: GeoStop[],
  candidate: GeoStop,
  maxDistanceKm: number
): boolean {
  if (craneMix(group, candidate)) return false;
  const spread = Math.max(...group.map((g) => distanceKm(g, candidate)));
  return spread <= maxDistanceKm;
}

/** Order delivery stops from warehouse using nearest-neighbor (minimizes driving). */
export function orderStopsForRoundTrip<T extends { lat: number; lng: number }>(
  stops: T[]
): T[] {
  if (stops.length <= 1) return [...stops];

  const remaining = [...stops];
  const ordered: T[] = [];
  let current: { lat: number; lng: number } = WAREHOUSE_LOCATION;

  while (remaining.length > 0) {
    remaining.sort(
      (a, b) => distanceKm(current, a) - distanceKm(current, b)
    );
    const next = remaining.shift()!;
    ordered.push(next);
    current = next;
  }

  return ordered;
}

function mergeNearbySmallGroups<T extends GeoStop>(
  groups: T[][],
  options: { maxOrders: number; maxDistanceKm: number }
): T[][] {
  let merged = groups.map((g) => [...g]);
  let changed = true;

  while (changed) {
    changed = false;
    outer: for (let i = 0; i < merged.length; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        const combined = [...merged[i], ...merged[j]];
        if (combined.length > options.maxOrders) continue;
        if (groupSpreadKm(combined) > options.maxDistanceKm) continue;

        const craneFlags = new Set(combined.map((s) => !!s.requiresCrane));
        if (craneFlags.size > 1) continue;

        merged = merged.filter((_, idx) => idx !== i && idx !== j);
        merged.push(combined);
        changed = true;
        break outer;
      }
    }
  }

  return merged;
}

/**
 * Cluster stops by map distance (not city name) so nearby municipalities
 * like Ferizaj + Hani i Elezit can share one truck.
 */
export function clusterStopsByProximity<T extends GeoStop>(
  stops: T[],
  options: RouteClusterOptions
): T[][] {
  if (stops.length === 0) return [];

  const maxOrders = Math.max(1, options.maxOrders);
  const maxDistanceKm = options.maxDistanceKm;
  const mergeDistanceKm = options.mergeDistanceKm ?? maxDistanceKm + 5;
  const used = new Set<number>();
  const groups: T[][] = [];

  const sorted = [...stops].sort(
    (a, b) => distanceFromWarehouse(b) - distanceFromWarehouse(a)
  );

  for (const seed of sorted) {
    if (used.has(seed.id)) continue;
    const group: T[] = [seed];
    used.add(seed.id);

    let improved = true;
    while (improved && group.length < maxOrders) {
      improved = false;
      let best: T | null = null;
      let bestDist = Infinity;

      for (const candidate of stops) {
        if (used.has(candidate.id)) continue;
        if (!canAddToGroup(group, candidate, maxDistanceKm)) continue;
        const dist = Math.min(...group.map((g) => distanceKm(g, candidate)));
        if (dist < bestDist) {
          bestDist = dist;
          best = candidate;
        }
      }

      if (best) {
        group.push(best);
        used.add(best.id);
        improved = true;
      }
    }

    groups.push(group);
  }

  return mergeNearbySmallGroups(groups, {
    maxOrders,
    maxDistanceKm: mergeDistanceKm,
  });
}

/** Normalize municipality/region for dispatch grouping (Prishtinë ≈ prishtine). */
export function normalizeDispatchRegion(stop: GeoStop): string {
  return (stop.region || stop.city || "unknown")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Group orders by region first, then by map distance inside each region.
 * Keeps Prishtinë (and other municipalities) on the same truck run instead of
 * mixing with Mitrovicë/Ferizaj on one trip.
 */
export function clusterStopsByRegionThenProximity<T extends GeoStop>(
  stops: T[],
  options: RouteClusterOptions & { regionMaxDistanceKm?: number }
): T[][] {
  if (stops.length === 0) return [];

  const byRegion = new Map<string, T[]>();
  for (const stop of stops) {
    const key = normalizeDispatchRegion(stop);
    const bucket = byRegion.get(key) ?? [];
    bucket.push(stop);
    byRegion.set(key, bucket);
  }

  const intraMaxKm =
    options.regionMaxDistanceKm ?? Math.max(options.maxDistanceKm, 45);

  const regionBuckets = [...byRegion.entries()].sort((a, b) => {
    const palletsA = a[1].reduce(
      (s, o) => s + ((o as { totalPallets?: number }).totalPallets ?? 1),
      0
    );
    const palletsB = b[1].reduce(
      (s, o) => s + ((o as { totalPallets?: number }).totalPallets ?? 1),
      0
    );
    if (palletsB !== palletsA) return palletsB - palletsA;
    return b[1].length - a[1].length;
  });

  const allGroups: T[][] = [];
  for (const [, regionStops] of regionBuckets) {
    const groups = clusterStopsByProximity(regionStops, {
      maxOrders: options.maxOrders,
      maxDistanceKm: intraMaxKm,
      mergeDistanceKm: intraMaxKm + 5,
    });
    allGroups.push(...groups);
  }

  return allGroups;
}

export function describeRouteAreas(stops: GeoStop[]): string {
  const labels = [
    ...new Set(stops.map((s) => s.city || s.region || "area").filter(Boolean)),
  ];
  return labels.length > 0 ? labels.join(" · ") : "nearby stops";
}
