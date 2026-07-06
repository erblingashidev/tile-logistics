import {
  distanceFromWarehouse,
  distanceKm,
  resolveLocation,
  type LocationEntry,
} from "@/lib/locations";
import {
  clusterStopsByRegionThenProximity,
  describeRouteAreas,
  orderStopsForRoundTrip,
  type GeoStop,
} from "@/lib/dispatch/route-cluster";
import { checkVehicleCapacity } from "@/lib/calculations";

export interface RouteOrder {
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
  assigned: boolean;
}

export interface RouteSuggestion {
  id: string;
  city: string;
  region: string;
  orders: RouteOrder[];
  totalPallets: number;
  totalWeightKg: number;
  totalM2: number;
  maxDistanceKm: number;
  maxDistanceFromWarehouseKm: number;
  fitsVehicle: boolean;
  vehicleMessage?: string;
}

export interface RoutePlanFilters {
  region?: string;
  city?: string;
  employeeId?: number;
  pickerId?: number;
  driverId?: number;
  unassignedOnly?: boolean;
  maxOrdersPerRoute?: number;
  maxDistanceKm?: number;
  vehicleId?: number;
  vehicleMaxPallets?: number;
  vehicleMaxWeightKg?: number;
  vehicleUsedPallets?: number;
  vehicleUsedWeightKg?: number;
}

function toRouteOrder(order: {
  id: number;
  invoiceNumber: string;
  customerName: string;
  location: string;
  region?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  totalPallets: number;
  totalWeightKg: number;
  totalM2: number;
  assignment?: unknown;
}): RouteOrder | null {
  const loc =
    order.lat && order.lng
      ? ({
          name: order.location,
          city: order.city ?? "",
          region:
            order.region ??
            resolveLocation(order.location)?.region ??
            order.city ??
            "",
          lat: order.lat,
          lng: order.lng,
        } as LocationEntry)
      : resolveLocation(order.location);

  if (!loc && !order.region) return null;

  return {
    id: order.id,
    invoiceNumber: order.invoiceNumber,
    customerName: order.customerName,
    location: order.location,
    city: order.city ?? loc?.city ?? "",
    region: order.region ?? loc?.region ?? order.city ?? "",
    lat: order.lat ?? loc?.lat ?? 0,
    lng: order.lng ?? loc?.lng ?? 0,
    totalPallets: order.totalPallets,
    totalWeightKg: order.totalWeightKg,
    totalM2: order.totalM2,
    assigned: !!order.assignment,
  };
}

function routeFitsVehicle(
  orders: RouteOrder[],
  filters: RoutePlanFilters
): { fits: boolean; message?: string } {
  if (!filters.vehicleMaxPallets) return { fits: true };

  const routeTotals = {
    totalPallets: orders.reduce((s, o) => s + o.totalPallets, 0),
    totalWeightKg: orders.reduce((s, o) => s + o.totalWeightKg, 0),
    totalM2: 0,
    totalPieces: 0,
  };

  const existing = {
    totalPallets: filters.vehicleUsedPallets ?? 0,
    totalWeightKg: filters.vehicleUsedWeightKg ?? 0,
    totalM2: 0,
    totalPieces: 0,
  };

  const check = checkVehicleCapacity(
    [existing],
    routeTotals,
    filters.vehicleMaxPallets,
    filters.vehicleMaxWeightKg ?? 999999
  );

  if (!check.palletsOk) {
    return { fits: false, message: check.message };
  }
  return {
    fits: true,
    message: check.weightWarning,
  };
}

/** Suggest routes of 2–3 nearby orders that fit the selected vehicle. */
export function suggestRoutes(
  rawOrders: Parameters<typeof toRouteOrder>[0][],
  filters: RoutePlanFilters
): RouteSuggestion[] {
  const maxOrders = Math.min(8, Math.max(2, filters.maxOrdersPerRoute ?? 6));
  const maxDist = filters.maxDistanceKm ?? 30;

  let orders = rawOrders
    .map(toRouteOrder)
    .filter((o): o is RouteOrder => o != null);

  if (filters.unassignedOnly !== false) {
    orders = orders.filter((o) => !o.assigned);
  }
  if (filters.region) {
    orders = orders.filter((o) => o.region === filters.region);
  }
  if (filters.city) {
    orders = orders.filter((o) => o.city === filters.city);
  }

  const geoStops: GeoStop[] = orders.map((o) => ({
    id: o.id,
    lat: o.lat,
    lng: o.lng,
    city: o.city,
    region: o.region,
  }));

  const clusters = clusterStopsByRegionThenProximity(geoStops, {
    maxOrders,
    maxDistanceKm: maxDist,
    mergeDistanceKm: maxDist + 5,
    regionMaxDistanceKm: Math.max(maxDist, 45),
  });

  const orderById = new Map(orders.map((o) => [o.id, o]));
  const suggestions: RouteSuggestion[] = [];

  for (const cluster of clusters) {
    if (cluster.length < 2) continue;

    const group = cluster
      .map((s) => orderById.get(s.id))
      .filter((o): o is RouteOrder => o != null);

    if (group.length < 2) continue;

    const ordered = orderStopsForRoundTrip(group);
    const areas = describeRouteAreas(group);
    const city = areas;

    const totalPallets = group.reduce((s, o) => s + o.totalPallets, 0);
    const totalWeightKg = group.reduce((s, o) => s + o.totalWeightKg, 0);
    const totalM2 = group.reduce((s, o) => s + o.totalM2, 0);
    let maxDistanceKm = 0;
    let maxDistanceFromWarehouseKm = 0;
    for (let a = 0; a < group.length; a++) {
      maxDistanceFromWarehouseKm = Math.max(
        maxDistanceFromWarehouseKm,
        distanceFromWarehouse(group[a])
      );
      for (let b = a + 1; b < group.length; b++) {
        maxDistanceKm = Math.max(
          maxDistanceKm,
          distanceKm(group[a], group[b])
        );
      }
    }

    const fit = routeFitsVehicle(group, filters);

    suggestions.push({
      id: `${city}-${group.map((o) => o.id).join("-")}`,
      city,
      region: group[0].region,
      orders: ordered,
      totalPallets,
      totalWeightKg,
      totalM2,
      maxDistanceKm: Math.round(maxDistanceKm * 10) / 10,
      maxDistanceFromWarehouseKm:
        Math.round(maxDistanceFromWarehouseKm * 10) / 10,
      fitsVehicle: fit.fits,
      vehicleMessage: fit.message,
    });
  }

  return suggestions.sort((a, b) => {
    if (a.fitsVehicle !== b.fitsVehicle) return a.fitsVehicle ? -1 : 1;
    return b.orders.length - a.orders.length;
  });
}
