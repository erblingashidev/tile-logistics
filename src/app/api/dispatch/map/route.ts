import { NextRequest, NextResponse } from "next/server";
import { requireApiSessionNoSalesWrite } from "@/lib/auth/api-guard";
import { orderStopsForRoundTrip } from "@/lib/dispatch/route-cluster";
import { groupSpreadKm } from "@/lib/dispatch/route-cluster-utils";
import {
  generateDispatchPlan,
  type DispatchPlan,
} from "@/lib/dispatch/recommendations";
import { truckColorForVehicle } from "@/lib/dispatch/truck-colors";
import { WAREHOUSE_LOCATION, resolveOrderGeo } from "@/lib/locations";
import { isOrderUrgent } from "@/lib/order-priority";
import { getDispatchBoard } from "@/lib/services/dispatch-board";
import { listOrders, getVehicleLoad } from "@/lib/services/orders";
import { getDriverForVehicle } from "@/lib/services/employees";
import { listTransportVehicles } from "@/lib/services/vehicles";
import { getTruckLoadStatus } from "@/lib/services/load-coordination";

export const runtime = "nodejs";

interface MapStop {
  id: number;
  lat: number;
  lng: number;
  invoiceNumber: string;
  customerName: string;
  location: string;
  sequence: number;
}

interface MapUnassignedOrder {
  id: number;
  lat: number;
  lng: number;
  invoiceNumber: string;
  customerName: string;
  location: string;
  region: string;
  priority: "normal" | "urgent";
  totalPallets: number;
}

function buildRouteCoordinates(
  stops: Array<{ lat: number; lng: number }>
): [number, number][] {
  if (stops.length === 0) return [];
  const ordered = orderStopsForRoundTrip(stops);
  return [
    [WAREHOUSE_LOCATION.lng, WAREHOUSE_LOCATION.lat],
    ...ordered.map((s) => [s.lng, s.lat] as [number, number]),
  ];
}

function roundStatusLabel(
  truckStatus: Awaited<ReturnType<typeof getTruckLoadStatus>> | null,
  orderCount: number
): { status: string; statusLabel: string } {
  if (orderCount === 0) return { status: "empty", statusLabel: "Empty" };
  if (!truckStatus) return { status: "loading", statusLabel: "Loading" };
  if (truckStatus.hasFullyDeparted) {
    return { status: "departed", statusLabel: "On the road / done" };
  }
  if (truckStatus.canDepart) {
    return { status: "ready", statusLabel: "Ready to leave" };
  }
  if (truckStatus.allResolved) {
    return { status: "ready", statusLabel: "Loader done — awaiting driver" };
  }
  return {
    status: "loading",
    statusLabel: `Loading ${truckStatus.resolvedCount}/${truckStatus.totalOrders}`,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiSessionNoSalesWrite(request.method);
  if (!auth.ok) return auth.response;

  const sp = request.nextUrl.searchParams;
  const deliveryRound = sp.get("deliveryRound")
    ? Number(sp.get("deliveryRound"))
    : 1;
  const includePlan = sp.get("includePlan") === "true";
  const maxOrders = sp.get("maxOrders")
    ? Number(sp.get("maxOrders"))
    : undefined;
  const maxDistanceKm = sp.get("maxDistanceKm")
    ? Number(sp.get("maxDistanceKm"))
    : undefined;
  const region = sp.get("region") ?? undefined;

  let missingGeo = 0;
  const unassigned: MapUnassignedOrder[] = [];

  const unassignedOrders = await listOrders({
    unassigned: true,
    region,
  });

  for (const order of unassignedOrders) {
    if (order.status === "delivered" || order.status === "cancelled") continue;
    const geo = resolveOrderGeo({
      location: order.location,
      locationId: order.locationId,
      city: order.city,
      region: order.region,
      lat: order.lat,
      lng: order.lng,
    });
    if (!geo) {
      missingGeo++;
      continue;
    }
    unassigned.push({
      id: order.id,
      lat: geo.lat,
      lng: geo.lng,
      invoiceNumber: order.invoiceNumber,
      customerName: order.customerName,
      location: order.location,
      region: order.region ?? geo.region,
      priority: isOrderUrgent(order) ? "urgent" : "normal",
      totalPallets: order.totalPallets,
    });
  }

  const fleet = await listTransportVehicles();
  const board = await getDispatchBoard();
  const boardTruckById = new Map(board.trucks.map((t) => [t.vehicleId, t]));

  type MapTruckPayload = {
    vehicleId: number;
    name: string;
    plateNumber: string;
    driverName: string | null;
    color: string;
    rounds: Array<{
      round: number;
      status: string;
      statusLabel: string;
      totalPallets: number;
      maxPallets: number;
      spreadKm: number;
      regions: string[];
      stops: MapStop[];
      routeCoordinates: [number, number][];
    }>;
  };

  const trucks: MapTruckPayload[] = [];

  for (const v of fleet) {
    const driver = await getDriverForVehicle(v.id);
    const load = await getVehicleLoad(v.id, deliveryRound);
    const activeOrders = load.assignedOrders.filter(
      (o) => o.status !== "delivered" && o.status !== "cancelled"
    );

    const geoStops: Array<{
      id: number;
      lat: number;
      lng: number;
      invoiceNumber: string;
      customerName: string;
      location: string;
    }> = [];

    for (const order of activeOrders) {
      const geo = resolveOrderGeo({
        location: order.location,
        locationId: order.locationId,
        city: order.city,
        region: order.region,
        lat: order.lat,
        lng: order.lng,
      });
      if (!geo) {
        missingGeo++;
        continue;
      }
      geoStops.push({
        id: order.id,
        lat: geo.lat,
        lng: geo.lng,
        invoiceNumber: order.invoiceNumber,
        customerName: order.customerName,
        location: order.location,
      });
    }

    const orderedStops = orderStopsForRoundTrip(geoStops);
    const stops: MapStop[] = orderedStops.map((s, idx) => ({
      ...s,
      sequence: idx + 1,
    }));

    const geo = geoStops.map((s) => ({ lat: s.lat, lng: s.lng }));
    const spreadKm =
      geo.length >= 2 ? Math.round(groupSpreadKm(geo) * 10) / 10 : 0;

    const regions = [
      ...new Set(
        activeOrders.map((o) => o.region ?? o.city).filter(Boolean) as string[]
      ),
    ];

    const truckStatus =
      activeOrders.length > 0
        ? await getTruckLoadStatus(v.id, deliveryRound)
        : null;
    const { status, statusLabel } = roundStatusLabel(
      truckStatus,
      activeOrders.length
    );

    const boardRound = boardTruckById
      .get(v.id)
      ?.rounds.find((r) => r.round === deliveryRound);

    const showTruck =
      v.status === "available" ||
      activeOrders.length > 0 ||
      (boardRound?.orders.length ?? 0) > 0;

    if (!showTruck) continue;

    trucks.push({
      vehicleId: v.id,
      name: v.name,
      plateNumber: v.plateNumber,
      driverName: driver?.name ?? null,
      color: truckColorForVehicle(v.id),
      rounds: [
        {
          round: deliveryRound,
          status,
          statusLabel,
          totalPallets: load.totals.pallets,
          maxPallets: v.maxPallets,
          spreadKm,
          regions,
          stops,
          routeCoordinates: buildRouteCoordinates(geoStops),
        },
      ],
    });
  }

  const payload: {
    warehouse: typeof WAREHOUSE_LOCATION;
    unassigned: MapUnassignedOrder[];
    trucks: MapTruckPayload[];
    missingGeo: number;
    plan?: DispatchPlan;
  } = {
    warehouse: WAREHOUSE_LOCATION,
    unassigned,
    trucks,
    missingGeo,
  };

  if (includePlan) {
    payload.plan = await generateDispatchPlan({
      deliveryRound,
      region,
      maxOrdersPerRoute: maxOrders,
      maxDistanceKm,
    });
  }

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}
