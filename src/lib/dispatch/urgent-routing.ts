import { distanceFromWarehouse, distanceKm } from "@/lib/locations";
import { groupSpreadKm } from "@/lib/dispatch/route-cluster-utils";
import { checkVehicleCapacity } from "@/lib/calculations";
import { MAX_DELIVERY_ROUNDS } from "@/lib/constants";
import { isOrderUrgent } from "@/lib/order-priority";
import { getOrder, getVehicleLoad } from "@/lib/services/orders";
import { getDriverForVehicle } from "@/lib/services/employees";
import { getTruckLoadStatus } from "@/lib/services/load-coordination";
import { listVehicles } from "@/lib/services/vehicles";
import {
  pickerFromRouteOrders,
  pickerOnTruckRound,
} from "@/lib/dispatch/picker-resolution";
import { analyzeOrderCargo } from "@/lib/dispatch/large-tiles";
import {
  rankVehiclesForLoad,
  vehicleHasCrane,
  type DispatchVehicle,
} from "@/lib/dispatch/vehicles";

/** Max km between urgent stop and every stop already on the truck route. */
export const URGENT_MAX_ROUTE_SPREAD_KM = 32;

export interface UrgentPlacementOption {
  id: string;
  vehicleId: number;
  vehicleName: string;
  plateNumber: string;
  deliveryRound: number;
  fitScore: number;
  distanceToRouteKm: number;
  routeSpreadKm: number;
  sameRegion: boolean;
  almostReady: boolean;
  remainingPallets: number;
  routeRegions: string[];
  routeInvoices: string[];
  pickerId: number | null;
  pickerName: string | null;
  driverName: string | null;
  reasons: string[];
  kind: "join_route" | "new_route" | "next_round";
}

function geoStop(order: {
  lat?: number | null;
  lng?: number | null;
  region?: string | null;
}) {
  if (order.lat == null || order.lng == null) return null;
  return {
    lat: order.lat,
    lng: order.lng,
    region: order.region ?? undefined,
  };
}

function minDistanceToRoute(
  order: { lat: number; lng: number },
  route: Array<{ lat?: number | null; lng?: number | null }>
): number {
  let min = Infinity;
  for (const stop of route) {
    if (stop.lat == null || stop.lng == null) continue;
    min = Math.min(min, distanceKm(order, { lat: stop.lat, lng: stop.lng }));
  }
  return min === Infinity ? distanceFromWarehouse(order) : min;
}

function routeRegions(
  routeOrders: Array<{ region?: string | null; city?: string | null }>
): string[] {
  return [
    ...new Set(
      routeOrders
        .map((o) => o.region ?? o.city)
        .filter((r): r is string => Boolean(r))
    ),
  ];
}

async function toDispatchVehicle(
  v: Awaited<ReturnType<typeof listVehicles>>[number],
  deliveryRound: number
): Promise<DispatchVehicle> {
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
    costPerKm: 1.1,
    usedPallets: load.totals.pallets,
    usedWeightKg: load.totals.weightKg,
  };
}

async function resolveUrgentPicker(
  vehicleId: number,
  deliveryRound: number,
  routeOrderIds: number[],
  order: NonNullable<Awaited<ReturnType<typeof getOrder>>>
): Promise<{ id: number | null; name: string | null }> {
  if (routeOrderIds.length > 0) {
    const fromRoute = await pickerFromRouteOrders(routeOrderIds);
    if (fromRoute) return fromRoute;
  }
  const onTruck = await pickerOnTruckRound(vehicleId, deliveryRound);
  if (onTruck) return onTruck;
  if (order.staff?.picker?.employeeId) {
    return {
      id: order.staff.picker.employeeId,
      name: order.staff.picker.employeeName,
    };
  }
  return { id: null, name: null };
}

export async function recommendUrgentPlacement(
  orderId: number,
  options?: { maxSpreadKm?: number }
): Promise<
  | { ok: true; orderId: number; options: UrgentPlacementOption[] }
  | { ok: false; error: string }
> {
  const maxSpread = options?.maxSpreadKm ?? URGENT_MAX_ROUTE_SPREAD_KM;
  const order = await getOrder(orderId);
  if (!order) return { ok: false, error: "Order not found" };
  if (!isOrderUrgent(order)) {
    return { ok: false, error: "Order is not marked urgent" };
  }
  if (order.assignment) {
    return {
      ok: false,
      error: `Already on ${order.assignment.vehicleName} · R${order.assignment.deliveryRound}`,
    };
  }
  const stop = geoStop(order);
  if (!stop) {
    return { ok: false, error: "Order needs a mapped delivery location" };
  }

  const cargo = analyzeOrderCargo(order.items ?? []);
  const candidates: UrgentPlacementOption[] = [];
  const fleet = await listVehicles();

  for (let round = 1; round <= MAX_DELIVERY_ROUNDS; round++) {
    for (const vehicle of fleet) {
      if (vehicle.status !== "available") continue;

      const load = await getVehicleLoad(vehicle.id, round);
      const dispatchV = await toDispatchVehicle(vehicle, round);
      const remaining = dispatchV.maxPallets - load.totals.pallets;
      if (remaining < order.totalPallets) continue;

      const capacity = checkVehicleCapacity(
        [{ totalPallets: load.totals.pallets, totalWeightKg: load.totals.weightKg, totalM2: 0, totalPieces: 0, totalTruckPalletSlots: load.totals.pallets }],
        {
          totalPallets: order.totalPallets,
          totalWeightKg: order.totalWeightKg,
          totalM2: 0,
          totalPieces: 0,
          totalTruckPalletSlots: order.totalPallets,
        },
        dispatchV.maxPallets,
        dispatchV.maxWeightKg
      );
      if (!capacity.palletsOk) continue;

      const craneOk =
        !cargo.requiresCrane || dispatchV.hasCrane;
      if (!craneOk) continue;

      const routeOrders = load.assignedOrders.filter(
        (o) => o.status !== "delivered" && o.status !== "cancelled"
      );

      const truckStatus =
        routeOrders.length > 0
          ? await getTruckLoadStatus(vehicle.id, round)
          : null;

      const driver = await getDriverForVehicle(vehicle.id);

      if (routeOrders.length === 0) {
        const distWh = distanceFromWarehouse(stop);
        const picker = await resolveUrgentPicker(vehicle.id, round, [], order);
        candidates.push({
          id: `urg-${vehicle.id}-r${round}-new`,
          vehicleId: vehicle.id,
          vehicleName: vehicle.name,
          plateNumber: vehicle.plateNumber,
          deliveryRound: round,
          fitScore: 400 - distWh * 3 + (round === 1 ? 20 : round === 2 ? 10 : 0),
          distanceToRouteKm: Math.round(distWh * 10) / 10,
          routeSpreadKm: 0,
          sameRegion: false,
          almostReady: false,
          remainingPallets: remaining,
          routeRegions: [],
          routeInvoices: [],
          pickerId: picker.id,
          pickerName: picker.name,
          driverName: driver?.name ?? null,
          kind: round === 1 ? "new_route" : "next_round",
          reasons: [
            round === 1
              ? `Start a new route on ${vehicle.name} — ${Math.round(distWh)} km from depot`
              : `Round ${round} is free — dedicated run (~${Math.round(distWh)} km from depot)`,
          ],
        });
        continue;
      }

      const geoRoute = routeOrders
        .map(geoStop)
        .filter((s): s is NonNullable<typeof s> => s != null);
      if (geoRoute.length === 0) continue;

      const combined = [...geoRoute, stop];
      const spread = groupSpreadKm(combined);
      if (spread > maxSpread) continue;

      const distToRoute = minDistanceToRoute(stop, routeOrders);
      const regions = routeRegions(routeOrders);
      const sameRegion = regions.some(
        (r) => r.toLowerCase() === (order.region ?? order.city ?? "").toLowerCase()
      );
      const almostReady = Boolean(
        truckStatus?.canDepart || truckStatus?.allResolved
      );

      let fitScore =
        900 -
        distToRoute * 12 -
        spread * 2 +
        (sameRegion ? 100 : 0) +
        (almostReady ? 150 : truckStatus && truckStatus.resolvedCount > 0 ? 40 : 0) +
        (round === 1 ? 15 : round === 2 ? 8 : 0);

      const reasons: string[] = [];
      if (almostReady) {
        reasons.push(
          `Truck almost ready to leave — add to same run (${truckStatus!.resolvedCount}/${truckStatus!.totalOrders} loader steps done)`
        );
      } else {
        reasons.push(
          `Join ${vehicle.name} R${round} — ${routeOrders.length} stop(s) already planned`
        );
      }
      if (sameRegion) {
        reasons.push(`Same area: ${regions.join(" · ")}`);
      } else {
        reasons.push(
          `${Math.round(distToRoute)} km from nearest stop on this route (spread ${Math.round(spread * 10) / 10} km)`
        );
      }
      if (!sameRegion && distToRoute > 25) {
        reasons.push(
          "Note: different region — only suggested because distance still fits this route"
        );
        fitScore -= 30;
      }

      const picker = await resolveUrgentPicker(
        vehicle.id,
        round,
        routeOrders.map((o) => o.id),
        order
      );

      candidates.push({
        id: `urg-${vehicle.id}-r${round}-join`,
        vehicleId: vehicle.id,
        vehicleName: vehicle.name,
        plateNumber: vehicle.plateNumber,
        deliveryRound: round,
        fitScore,
        distanceToRouteKm: Math.round(distToRoute * 10) / 10,
        routeSpreadKm: Math.round(spread * 10) / 10,
        sameRegion,
        almostReady,
        remainingPallets: remaining - order.totalPallets,
        routeRegions: regions,
        routeInvoices: routeOrders.map((o) => o.invoiceNumber),
        pickerId: picker.id,
        pickerName: picker.name,
        driverName: driver?.name ?? null,
        kind: almostReady ? "join_route" : round > 1 ? "next_round" : "join_route",
        reasons,
      });
    }
  }

  if (candidates.length === 0) {
    const ranked = rankVehiclesForLoad(
      await Promise.all(
        fleet
          .filter((v) => v.status === "available")
          .map((v) => toDispatchVehicle(v, 1))
      ),
      order.totalPallets,
      order.totalWeightKg,
      cargo.requiresCrane
    );
    if (ranked.length === 0) {
      return {
        ok: false,
        error:
          "No truck route close enough and no free capacity — widen area or use next round manually",
      };
    }
    const pick = ranked[0];
    const distWh = distanceFromWarehouse(stop);
    const picker = await resolveUrgentPicker(pick.id, 1, [], order);
    return {
      ok: true,
      orderId,
      options: [
        {
          id: `urg-${pick.id}-r1-fallback`,
          vehicleId: pick.id,
          vehicleName: pick.name,
          plateNumber: pick.plateNumber,
          deliveryRound: 1,
          fitScore: 200 - distWh,
          distanceToRouteKm: Math.round(distWh * 10) / 10,
          routeSpreadKm: 0,
          sameRegion: false,
          almostReady: false,
          remainingPallets: pick.maxPallets - pick.usedPallets - order.totalPallets,
          routeRegions: [],
          routeInvoices: [],
          pickerId: picker.id,
          pickerName: picker.name,
          driverName: (await getDriverForVehicle(pick.id))?.name ?? null,
          kind: "new_route",
          reasons: [
            `No nearby route within ${maxSpread} km — closest option is ${pick.name} (new dedicated run)`,
          ],
        },
      ],
    };
  }

  candidates.sort((a, b) => b.fitScore - a.fitScore);
  return { ok: true, orderId, options: candidates.slice(0, 8) };
}
