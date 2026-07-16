import { MAX_DELIVERY_ROUNDS } from "@/lib/constants";
import {
  parseWorkDayFilter,
  workDayFilterLabel,
  type WorkDayFilter,
} from "@/lib/delivery-schedule";
import { formatDeliveryRound } from "@/lib/delivery-rounds";
import { generateFullDayDispatchPlan } from "@/lib/dispatch/recommendations";
import { describeRouteCluster } from "@/lib/services/dispatch-planning";
import { listOrders } from "@/lib/services/orders";
import { listTransportVehicles } from "@/lib/services/vehicles";

export interface DispatchPrintOrder {
  id: number;
  invoiceNumber: string;
  customerName: string;
  location: string;
  region: string | null;
  totalPallets: number;
  totalWeightKg: number;
  deliveryStageLabel: string;
  loadStatus: string;
  prepStatus: string;
  pickerName: string | null;
  driverName: string | null;
  stopSequence: number | null;
  routeCluster: string | null;
  preferredTruckName: string | null;
}

export interface DispatchPrintRound {
  round: number;
  roundLabel: string;
  orders: DispatchPrintOrder[];
  totalPallets: number;
  totalWeightKg: number;
  pickerNames: string[];
  driverName: string | null;
  routeClusters: string[];
}

export interface DispatchPrintTruck {
  vehicleId: number;
  name: string;
  plateNumber: string;
  driverName: string | null;
  rounds: DispatchPrintRound[];
  totalPallets: number;
  totalWeightKg: number;
}

export interface DispatchPrintEmployeeGroup {
  employeeName: string;
  role: "picker" | "driver";
  orders: DispatchPrintOrder[];
  totalPallets: number;
  totalWeightKg: number;
}

export interface DispatchPrintPlanRoute {
  id: string;
  deliveryRound: number;
  roundLabel: string;
  vehicleName: string;
  plateNumber: string;
  pickerName: string | null;
  driverName: string | null;
  routeCluster: string;
  orderCount: number;
  totalPallets: number;
  totalWeightKg: number;
  estimatedKm: number;
  orders: Array<{
    invoiceNumber: string;
    customerName: string;
    location: string;
    region: string | null;
  }>;
}

export interface DispatchPrintSheet {
  workDayLabel: string;
  generatedAt: string;
  unassigned: DispatchPrintOrder[];
  trucks: DispatchPrintTruck[];
  byEmployee: DispatchPrintEmployeeGroup[];
  suggestedRoutes: DispatchPrintPlanRoute[];
  daySummary: {
    assignedOrders: number;
    unassignedOrders: number;
    trucksUsed: number;
    totalPallets: number;
    totalWeightKg: number;
    roundsPlanned: number;
  };
}

export type DispatchPrintFilters = {
  workDay?: WorkDayFilter;
  shipAsOfDate?: string;
  hideDelivered?: boolean;
  includePlan?: boolean;
};

function toPrintOrder(
  order: Awaited<ReturnType<typeof listOrders>>[number],
  extras?: Partial<DispatchPrintOrder>,
  truckNameById?: Map<number, string>
): DispatchPrintOrder {
  const preferredTruckId = order.preferredTruckId ?? null;
  return {
    id: order.id,
    invoiceNumber: order.invoiceNumber,
    customerName: order.customerName,
    location: order.location,
    region: order.region ?? null,
    totalPallets: order.totalPallets,
    totalWeightKg: order.totalWeightKg,
    deliveryStageLabel: order.deliveryStageLabel ?? order.status,
    loadStatus: order.loadStatus ?? "pending",
    prepStatus: order.prepStatus ?? "pending",
    pickerName: order.staff?.picker?.employeeName ?? null,
    driverName:
      order.staff?.driver?.employeeName ??
      order.assignment?.driverName ??
      null,
    stopSequence: extras?.stopSequence ?? null,
    routeCluster: extras?.routeCluster ?? null,
    preferredTruckName:
      extras?.preferredTruckName ??
      (preferredTruckId != null
        ? truckNameById?.get(preferredTruckId) ?? `Truck #${preferredTruckId}`
        : null),
  };
}

function sumOrders(orders: DispatchPrintOrder[]) {
  return {
    totalPallets: orders.reduce((sum, order) => sum + order.totalPallets, 0),
    totalWeightKg: orders.reduce((sum, order) => sum + order.totalWeightKg, 0),
  };
}

export function parseDispatchPrintFilters(
  searchParams: URLSearchParams
): DispatchPrintFilters {
  const workDay = parseWorkDayFilter(searchParams.get("workDay"));
  const shipAsOfDate = searchParams.get("shipAsOfDate")?.trim() || undefined;
  return {
    workDay,
    shipAsOfDate,
    hideDelivered: searchParams.get("hideDelivered") !== "false",
    includePlan: searchParams.get("includePlan") !== "false",
  };
}

export async function getDispatchPrintSheet(
  filters: DispatchPrintFilters = {}
): Promise<DispatchPrintSheet> {
  const workDay = filters.workDay ?? "today";
  const orders = await listOrders({
    workDay,
    shipAsOfDate: filters.shipAsOfDate,
    hideDelivered: filters.hideDelivered !== false,
  });

  const fleet = await listTransportVehicles();
  const truckNameById = new Map(fleet.map((v) => [v.id, v.name]));

  const assigned = orders.filter((order) => order.assignment);
  const unassignedOrders = orders.filter((order) => !order.assignment);
  const unassigned = unassignedOrders.map((o) =>
    toPrintOrder(o, undefined, truckNameById)
  );

  const trucks: DispatchPrintTruck[] = [];

  for (const vehicle of fleet) {
    const rounds: DispatchPrintRound[] = [];

    for (let round = 1; round <= MAX_DELIVERY_ROUNDS; round++) {
      const roundAssigned = assigned.filter(
        (order) =>
          order.assignment?.vehicleId === vehicle.id &&
          order.assignment?.deliveryRound === round
      );

      if (roundAssigned.length === 0) continue;

      const roundOrders = roundAssigned.map((order, index) =>
        toPrintOrder(
          order,
          {
            stopSequence: index + 1,
            routeCluster: describeRouteCluster(
              roundAssigned.map((o) => ({
                city: o.city ?? undefined,
                region: o.region ?? undefined,
              }))
            ),
          },
          truckNameById
        )
      );

      const totals = sumOrders(roundOrders);
      const pickerNames = [
        ...new Set(
          roundOrders.map((order) => order.pickerName).filter(Boolean) as string[]
        ),
      ];
      const driverName =
        vehicle.assignedDriver?.name ??
        roundOrders.find((o) => o.driverName)?.driverName ??
        null;

      rounds.push({
        round,
        roundLabel: formatDeliveryRound(round, "short"),
        orders: roundOrders,
        totalPallets: totals.totalPallets,
        totalWeightKg: totals.totalWeightKg,
        pickerNames,
        driverName,
        routeClusters: [
          describeRouteCluster(
            roundAssigned.map((o) => ({
              city: o.city ?? undefined,
              region: o.region ?? undefined,
            }))
          ),
        ],
      });
    }

    const truckOrders = rounds.flatMap((round) => round.orders);
    if (truckOrders.length === 0) continue;

    const totals = sumOrders(truckOrders);
    trucks.push({
      vehicleId: vehicle.id,
      name: vehicle.name,
      plateNumber: vehicle.plateNumber,
      driverName: vehicle.assignedDriver?.name ?? null,
      rounds,
      totalPallets: totals.totalPallets,
      totalWeightKg: totals.totalWeightKg,
    });
  }

  trucks.sort((a, b) => b.totalPallets - a.totalPallets);

  const employeeMap = new Map<string, DispatchPrintEmployeeGroup>();
  for (const order of assigned) {
    const printOrder = toPrintOrder(order, undefined, truckNameById);
    const picker = order.staff?.picker?.employeeName;
    const driver =
      order.staff?.driver?.employeeName ??
      order.assignment?.driverName ??
      null;

    for (const [name, role] of [
      [picker, "picker"],
      [driver, "driver"],
    ] as const) {
      if (!name) continue;
      const key = `${role}:${name}`;
      const existing = employeeMap.get(key) ?? {
        employeeName: name,
        role,
        orders: [],
        totalPallets: 0,
        totalWeightKg: 0,
      };
      existing.orders.push(printOrder);
      existing.totalPallets += printOrder.totalPallets;
      existing.totalWeightKg += printOrder.totalWeightKg;
      employeeMap.set(key, existing);
    }
  }

  const byEmployee = [...employeeMap.values()].sort((a, b) =>
    a.employeeName.localeCompare(b.employeeName)
  );

  let suggestedRoutes: DispatchPrintPlanRoute[] = [];
  if (filters.includePlan !== false && unassignedOrders.length > 0) {
    try {
      const plan = await generateFullDayDispatchPlan({ maxRounds: 3 });
      suggestedRoutes = plan.rounds.flatMap((roundPlan) =>
        roundPlan.recommendations.map((rec) => ({
          id: rec.id,
          deliveryRound: rec.deliveryRound,
          roundLabel: formatDeliveryRound(rec.deliveryRound, "short"),
          vehicleName: rec.vehicleName,
          plateNumber: rec.plateNumber,
          pickerName: rec.pickerName,
          driverName: rec.driverName,
          routeCluster: rec.routeCluster,
          orderCount: rec.orders.length,
          totalPallets: rec.totalPallets,
          totalWeightKg: rec.totalWeightKg,
          estimatedKm: rec.estimatedKm,
          orders: rec.orders.map((o) => ({
            invoiceNumber: o.invoiceNumber,
            customerName: o.customerName,
            location: o.location,
            region: o.region ?? null,
          })),
        }))
      );
    } catch (err) {
      console.error("[dispatch-print] plan overlay failed", err);
    }
  }

  const allAssigned = trucks.flatMap((t) => t.rounds.flatMap((r) => r.orders));
  const totals = sumOrders(allAssigned);

  return {
    workDayLabel: workDayFilterLabel(workDay, filters.shipAsOfDate),
    generatedAt: new Date().toISOString(),
    unassigned,
    trucks,
    byEmployee,
    suggestedRoutes,
    daySummary: {
      assignedOrders: allAssigned.length,
      unassignedOrders: unassigned.length,
      trucksUsed: trucks.length,
      totalPallets: totals.totalPallets + sumOrders(unassigned).totalPallets,
      totalWeightKg: totals.totalWeightKg + sumOrders(unassigned).totalWeightKg,
      roundsPlanned: trucks.reduce((n, t) => n + t.rounds.length, 0),
    },
  };
}
