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
