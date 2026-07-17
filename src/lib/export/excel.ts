import * as XLSX from "xlsx";
import { listOrders, getOrdersGroupedByLocation } from "@/lib/services/orders";
import {
  buildOrderLineRows,
  buildOrderSummaryRows,
} from "@/lib/export/order-rows";

export async function buildOrdersExcel(filters?: Parameters<typeof listOrders>[0]) {
  const orders = await listOrders(filters);
  const summaryRows = buildOrderSummaryRows(orders);
  const lineRows = buildOrderLineRows(orders);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(summaryRows),
    "Order Summary"
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lineRows), "Line Items");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function buildLocationGroupedExcel() {
  const groups = await getOrdersGroupedByLocation();
  const orders = await listOrders();
  const lineRows = buildOrderLineRows(orders);

  const summaryRows = groups.map((g) => ({
    Region: g.region,
    Orders: g.orderCount,
    "Total M²": g.totalM2,
    "Total Pieces": g.totalPieces,
    "Total Pallets": g.totalPallets,
    "Total Weight (kg)": g.totalWeightKg,
    "Total Price": g.totalPrice,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(summaryRows),
    "By Location"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(buildOrderSummaryRows(orders)),
    "Order Summary"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(lineRows),
    "Line Items"
  );
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function buildPartialDeliveriesExcel(filters: {
  dateFrom?: string;
  dateTo?: string;
  scope?: "open" | "all";
  region?: string;
  search?: string;
}) {
  const { getPartialDeliveriesReport } = await import(
    "@/lib/services/partial-deliveries-report"
  );
  const report = await getPartialDeliveriesReport(filters);

  const orderRows = report.orders.map((o) => ({
    Invoice: o.invoiceNumber,
    Customer: o.customerName,
    Region: o.region ?? "",
    Location: o.location,
    "Order date": o.orderDate,
    Status: o.status,
    Stage: o.deliveryStageLabel,
    Open: o.isOpen ? "Yes" : "No",
    "Ordered plt": o.orderedPallets,
    "Sent plt": o.sentPallets,
    "Remaining plt": o.remainingPallets,
    "Ordered m²": o.orderedM2,
    "Sent m²": o.sentM2,
    "Remaining m²": o.remainingM2,
    Trips: o.shipmentCount,
    "Last partial": o.lastPartialAt
      ? o.lastPartialAt.slice(0, 16).replace("T", " ")
      : "",
    Truck: o.assignment
      ? `${o.assignment.vehicleName} R${o.assignment.deliveryRound}`
      : "",
  }));

  const tripRows = report.orders.flatMap((o) =>
    o.trips.map((t, idx) => ({
      Invoice: o.invoiceNumber,
      Customer: o.customerName,
      "Trip #": idx + 1,
      When: t.capturedAt.slice(0, 16).replace("T", " "),
      Driver: t.employeeName,
      "Sent plt": t.sentPallets,
      "Sent m²": t.sentM2,
      "Sent pieces": t.sentPieces,
      Notes: t.notes ?? "",
      Photo: t.photoUrl ? "Yes" : "No",
    }))
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(orderRows),
    "Partial orders"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(tripRows),
    "Delivery trips"
  );
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
