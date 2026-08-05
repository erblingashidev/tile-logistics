import * as XLSX from "xlsx";
import { listOrders } from "@/lib/services/orders";
import {
  buildOrderLineRows,
  buildOrderSummaryRows,
  buildPrintListRows,
  orderGroupKey,
  type ExportOrder,
} from "@/lib/export/order-rows";
import {
  appendMetaSheet,
  applyTableLayout,
  sanitizeSheetName,
  type ExportGroupBy,
} from "@/lib/export/excel-format";
import {
  buildDailyOrderRows,
  buildDailySummaryRows,
  buildGroupLeaderSummaryRows,
} from "@/lib/export/daily-report-rows";
import { todayDateString } from "@/lib/delivery-schedule";

function sheetFromRows(rows: Record<string, string | number>[], freezeRow = 1) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const colCount = rows.length > 0 ? Object.keys(rows[0]!).length : 1;
  applyTableLayout(ws, rows.length + 1, colCount, { freezeRow });
  return ws;
}

function groupOrders(
  orders: ExportOrder[],
  groupBy: Exclude<ExportGroupBy, "none">
): Map<string, ExportOrder[]> {
  const map = new Map<string, ExportOrder[]>();
  for (const order of orders) {
    const key = orderGroupKey(order, groupBy);
    const list = map.get(key) ?? [];
    list.push(order);
    map.set(key, list);
  }
  return new Map(
    [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "sq", { sensitivity: "base" }))
  );
}

export async function buildOrdersExcel(
  filters?: Parameters<typeof listOrders>[0],
  options?: { groupBy?: ExportGroupBy }
) {
  const groupBy = options?.groupBy ?? "none";
  const orders = await listOrders(filters);
  const generatedAt = new Date().toLocaleString("sq-AL");

  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>(["About", "Print list", "Order Summary", "Line Items"]);

  appendMetaSheet(wb, [
    { Field: "Report", Value: "AGIMI Logistics — Orders export" },
    { Field: "Generated", Value: generatedAt },
    { Field: "Orders", Value: String(orders.length) },
    {
      Field: "Grouped by",
      Value:
        groupBy === "none"
          ? "Flat list (use Print list sheet to filter in Excel)"
          : groupBy.charAt(0).toUpperCase() + groupBy.slice(1),
    },
    {
      Field: "Tip",
      Value:
        "Use the Print list sheet for printing. Filter or sort by Group column in Excel.",
    },
  ]);

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(buildPrintListRows(orders, groupBy)),
    "Print list"
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(buildOrderSummaryRows(orders)),
    "Order Summary"
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(buildOrderLineRows(orders)),
    "Line Items"
  );

  if (groupBy !== "none") {
    const groups = groupOrders(orders, groupBy);
    for (const [label, groupOrdersList] of groups) {
      if (groupOrdersList.length === 0) continue;
      const sheetName = sanitizeSheetName(label, usedNames);
      XLSX.utils.book_append_sheet(
        wb,
        sheetFromRows(buildPrintListRows(groupOrdersList, "none")),
        sheetName
      );
    }
  }

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export async function buildLocationGroupedExcel() {
  const { getOrdersGroupedByLocation } = await import("@/lib/services/orders");
  const groups = await getOrdersGroupedByLocation();
  const orders = await listOrders();
  const generatedAt = new Date().toLocaleString("sq-AL");

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
  appendMetaSheet(wb, [
    { Field: "Report", Value: "Orders by region — summary" },
    { Field: "Generated", Value: generatedAt },
    { Field: "Regions", Value: String(groups.length) },
  ]);

  XLSX.utils.book_append_sheet(wb, sheetFromRows(summaryRows), "By Region");
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(buildPrintListRows(orders, "region")),
    "Print list"
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(buildOrderSummaryRows(orders)),
    "Order Summary"
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(buildOrderLineRows(orders)),
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
  const generatedAt = new Date().toLocaleString("sq-AL");

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
  appendMetaSheet(wb, [
    { Field: "Report", Value: "Partial deliveries" },
    { Field: "Generated", Value: generatedAt },
    { Field: "Orders", Value: String(report.orders.length) },
  ]);
  XLSX.utils.book_append_sheet(wb, sheetFromRows(orderRows), "Partial orders");
  XLSX.utils.book_append_sheet(wb, sheetFromRows(tripRows), "Delivery trips");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** Daily boss report — filename and title use the report date. */
export async function buildDailyOperationsExcel(reportDate?: string) {
  const date = reportDate?.trim() || todayDateString();
  const orders = await listOrders({
    workDay: "date",
    shipAsOfDate: date,
    hideDelivered: false,
  });
  const generatedAt = new Date().toLocaleString("sq-AL");
  const title = `AGIMI Logistics — Daily report ${date}`;

  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>(["About", date, "Group leaders", "Delayed"]);

  appendMetaSheet(wb, [
    { Field: "Report", Value: title },
    { Field: "Report date", Value: date },
    { Field: "Generated", Value: generatedAt },
    { Field: "Orders scheduled", Value: String(orders.length) },
    {
      Field: "How to use",
      Value:
        "Send this file to management daily. Orders sheet = full detail; Group leaders = team performance.",
    },
  ]);

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(buildDailySummaryRows(orders, date)),
    sanitizeSheetName("Summary", usedNames)
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(buildDailyOrderRows(orders, date)),
    sanitizeSheetName(date, usedNames)
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(buildGroupLeaderSummaryRows(orders, date)),
    sanitizeSheetName("Group leaders", usedNames)
  );

  const delayed = orders.filter((order) => {
    const workDate =
      order.requestedDeliveryDate?.trim() || order.orderDate;
    return (
      order.status !== "delivered" &&
      order.status !== "cancelled" &&
      workDate < date
    );
  });
  if (delayed.length > 0) {
    XLSX.utils.book_append_sheet(
      wb,
      sheetFromRows(buildDailyOrderRows(delayed, date)),
      sanitizeSheetName("Delayed", usedNames)
    );
  }

  return {
    buffer: XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer,
    filename: `AGIMI-daily-report-${date}.xlsx`,
    title,
    orderCount: orders.length,
  };
}
