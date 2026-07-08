import { normalizeOrderUnit } from "@/lib/constants";
import { formatDeliverySchedule } from "@/lib/delivery-schedule";
import type { listOrders } from "@/lib/services/orders";

export type ExportOrder = Awaited<ReturnType<typeof listOrders>>[number];

function formatDimensions(item: ExportOrder["items"][number]) {
  if (normalizeOrderUnit(item.unit) !== "m2") return "";
  const w = item.tileWidthCm;
  const h = item.tileHeightCm;
  if (w == null || h == null) return "";
  const base = `${w}×${h} cm`;
  if (item.tileThicknessCm != null) {
    return `${base} · ${item.tileThicknessCm * 10} mm`;
  }
  return base;
}

function orderHeaderFields(order: ExportOrder) {
  const assignment = order.assignment;
  const picker = order.staff?.picker;
  const driver =
    order.staff?.driver?.employeeName ?? assignment?.driverName ?? "";

  return {
    "Order ID": order.id,
    Invoice: order.invoiceNumber,
    Customer: order.customerName,
    Region: order.region ?? "",
    City: order.city ?? "",
    "Delivery details": order.location,
    Latitude: order.lat ?? "",
    Longitude: order.lng ?? "",
    "Order date": order.orderDate,
    "Requested delivery date": order.requestedDeliveryDate ?? "",
    "Delivery time preference": order.deliveryTimePreference ?? "flexible",
    "Delivery schedule": formatDeliverySchedule(order),
    "Created at": order.createdAt,
    Price: order.price,
    Status: order.status,
    "Delivery stage":
      "deliveryStageLabel" in order && order.deliveryStageLabel
        ? order.deliveryStageLabel
        : order.status,
    "Load status":
      "loadStatus" in order ? (order.loadStatus ?? "") : "",
    "Load notes":
      "loadNotes" in order ? (order.loadNotes ?? "") : "",
    Notes: order.notes ?? "",
    Picker: picker?.employeeName ?? "",
    Driver: driver,
    Vehicle: assignment?.vehicleName ?? "",
    "Plate number": assignment?.plateNumber ?? "",
    "Delivery round": assignment?.deliveryRound ?? "",
    "Truck assigned at": assignment?.assignedAt ?? "",
    "Proof steps completed": order.proofs
      ?.map((p) => p.phase)
      .join(", ") ?? "",
    "Order total m²": order.totalM2,
    "Order total pieces": order.totalPieces,
    "Order total pallets": order.totalPallets,
    "Order total weight (kg)": order.totalWeightKg,
  };
}

function emptyOrderHeaderFields(): Record<string, string | number> {
  return {
    "Order ID": "",
    Invoice: "",
    Customer: "",
    Region: "",
    City: "",
    "Delivery details": "",
    Latitude: "",
    Longitude: "",
    "Order date": "",
    "Requested delivery date": "",
    "Delivery time preference": "",
    "Delivery schedule": "",
    "Created at": "",
    Price: "",
    Status: "",
    "Delivery stage": "",
    "Load status": "",
    "Load notes": "",
    Notes: "",
    Picker: "",
    Driver: "",
    Vehicle: "",
    "Plate number": "",
    "Delivery round": "",
    "Truck assigned at": "",
    "Proof steps completed": "",
    "Order total m²": "",
    "Order total pieces": "",
    "Order total pallets": "",
    "Order total weight (kg)": "",
  };
}

function emptyLineFields(): Record<string, string | number> {
  return {
    "Line #": "",
    "Unit": "",
    "Product name": "",
    Dimensions: "",
    "Width (cm)": "",
    "Length (cm)": "",
    "Thickness (mm)": "",
    "Line m²": "",
    "Line pieces": "",
    "Line pallets": "",
    "Calc. pieces": "",
    "Calc. pallets": "",
    "Line weight (kg)": "",
  };
}

function lineItemFields(
  item: ExportOrder["items"][number],
  lineNumber: number
): Record<string, string | number> {
  return {
    "Line #": lineNumber,
    "Unit": normalizeOrderUnit(item.unit),
    "Product name": item.productName ?? "",
    Dimensions: formatDimensions(item),
    "Width (cm)": item.tileWidthCm ?? "",
    "Length (cm)": item.tileHeightCm ?? "",
    "Thickness (mm)":
      item.tileThicknessCm != null ? item.tileThicknessCm * 10 : "",
    "Line m²": item.quantityM2 ?? "",
    "Line pieces": item.pieceCount ?? "",
    "Line pallets": item.palletCount ?? "",
    "Calc. pieces": item.calculatedPieces ?? "",
    "Calc. pallets": item.calculatedPallets ?? "",
    "Line weight (kg)": item.weightKg ?? "",
  };
}

/** One spreadsheet row per product line; order details only on the first line. */
export function buildOrderLineRows(orders: ExportOrder[]) {
  const rows: Record<string, string | number>[] = [];
  for (const order of orders) {
    const header = orderHeaderFields(order);

    if (order.items.length === 0) {
      rows.push({
        ...header,
        ...emptyLineFields(),
      });
      continue;
    }

    for (let idx = 0; idx < order.items.length; idx++) {
      rows.push({
        ...(idx === 0 ? header : emptyOrderHeaderFields()),
        ...lineItemFields(order.items[idx], idx + 1),
      });
    }
  }
  return rows;
}

/** One row per order — summary for quick overview sheets. */
export function buildOrderSummaryRows(orders: ExportOrder[]) {
  return orders.map((order) => orderHeaderFields(order));
}
