import { MAX_DELIVERY_ROUNDS } from "@/lib/constants";
import {
  parseWorkDayFilter,
  workDayFilterLabel,
  type WorkDayFilter,
} from "@/lib/delivery-schedule";
import { formatDeliveryRound } from "@/lib/delivery-rounds";
import { listOrders } from "@/lib/services/orders";
import { listVehicles } from "@/lib/services/vehicles";

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
}

export interface DispatchPrintRound {
  round: number;
  roundLabel: string;
  orders: DispatchPrintOrder[];
  totalPallets: number;
  totalWeightKg: number;
  pickerNames: string[];
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

export interface DispatchPrintSheet {
  workDayLabel: string;
  generatedAt: string;
  unassigned: DispatchPrintOrder[];
  trucks: DispatchPrintTruck[];
  byEmployee: DispatchPrintEmployeeGroup[];
}

export type DispatchPrintFilters = {
  workDay?: WorkDayFilter;
  shipAsOfDate?: string;
  hideDelivered?: boolean;
};

function toPrintOrder(order: Awaited<ReturnType<typeof listOrders>>[number]): DispatchPrintOrder {
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

  const printOrders = orders.map(toPrintOrder);
  const assigned = orders.filter((order) => order.assignment);
  const unassigned = printOrders.filter(
    (_, index) => !orders[index]?.assignment
  );

  const fleet = await listVehicles();
  const trucks: DispatchPrintTruck[] = [];

  for (const vehicle of fleet) {
    const rounds: DispatchPrintRound[] = [];

    for (let round = 1; round <= MAX_DELIVERY_ROUNDS; round++) {
      const roundOrders = assigned
        .filter(
          (order) =>
            order.assignment?.vehicleId === vehicle.id &&
            order.assignment?.deliveryRound === round
        )
        .map(toPrintOrder);

      if (roundOrders.length === 0 && round > 2) continue;

      const totals = sumOrders(roundOrders);
      const pickerNames = [
        ...new Set(
          roundOrders.map((order) => order.pickerName).filter(Boolean) as string[]
        ),
      ];

      rounds.push({
        round,
        roundLabel: formatDeliveryRound(round, "short"),
        orders: roundOrders,
        totalPallets: totals.totalPallets,
        totalWeightKg: totals.totalWeightKg,
        pickerNames,
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
      rounds: rounds.filter((round) => round.orders.length > 0),
      totalPallets: totals.totalPallets,
      totalWeightKg: totals.totalWeightKg,
    });
  }

  trucks.sort((a, b) => b.totalPallets - a.totalPallets);

  const employeeMap = new Map<string, DispatchPrintEmployeeGroup>();
  for (const order of assigned) {
    const printOrder = toPrintOrder(order);
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

  return {
    workDayLabel: workDayFilterLabel(workDay, filters.shipAsOfDate),
    generatedAt: new Date().toISOString(),
    unassigned,
    trucks,
    byEmployee,
  };
}
