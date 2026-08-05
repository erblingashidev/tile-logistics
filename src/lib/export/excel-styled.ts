import ExcelJS from "exceljs";

export type OrderRowStatus =
  | "completed"
  | "partial"
  | "delayed"
  | "in_transit"
  | "waiting"
  | "pending"
  | "cancelled";

const STATUS_STYLE: Record<
  OrderRowStatus,
  { fg: string; bg: string; label: string }
> = {
  completed: { fg: "FF14532D", bg: "FFDCFCE7", label: "Completed" },
  partial: { fg: "FF9A3412", bg: "FFFFEDD5", label: "Partial" },
  delayed: { fg: "FF991B1B", bg: "FFFEE2E2", label: "Delayed" },
  in_transit: { fg: "FF1E40AF", bg: "FFDBEAFE", label: "In transit" },
  waiting: { fg: "FF92400E", bg: "FFFEF3C7", label: "Waiting" },
  pending: { fg: "FF374151", bg: "FFF3F4F6", label: "Pending" },
  cancelled: { fg: "FF6B7280", bg: "FFE5E7EB", label: "Cancelled" },
};

const HEADER = { fg: "FFFFFFFF", bg: "FF1F2937" };
const SUMMARY_LABEL = { fg: "FF374151", bg: "FFF3F4F6" };
const SUMMARY_VALUE = { fg: "FF111827", bg: "FFFFFFFF" };

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFE5E7EB" } },
  left: { style: "thin", color: { argb: "FFE5E7EB" } },
  bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
  right: { style: "thin", color: { argb: "FFE5E7EB" } },
};

function fillCell(
  cell: ExcelJS.Cell,
  fg: string,
  bg: string,
  bold = false
) {
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: bg },
  };
  cell.font = { color: { argb: fg }, bold };
  cell.border = THIN_BORDER;
  cell.alignment = { vertical: "middle", wrapText: true };
}

export function classifyOrderExportRow(
  row: Record<string, string | number>
): OrderRowStatus {
  const pipeline = String(row.Pipeline ?? "").trim().toLowerCase();
  if (pipeline === "completed") return "completed";
  if (pipeline === "partial") return "partial";
  if (pipeline === "delayed") return "delayed";
  if (pipeline === "in transit") return "in_transit";
  if (pipeline === "waiting") return "waiting";
  if (pipeline === "cancelled") return "cancelled";
  if (pipeline === "pending") return "pending";

  if (row.Complete === "Yes") return "completed";
  if (row.Status === "cancelled") return "cancelled";
  if (row.Partial === "Yes") return "partial";
  if (row.Delayed === "Yes") return "delayed";
  if (row.Status === "in_transit") return "in_transit";
  if (row.Status === "assigned" || row["Picker assigned"]) return "waiting";
  return "pending";
}

export function classifyPickerExportRow(
  row: Record<string, string | number>
): OrderRowStatus | null {
  const delayed = Number(row.Delayed ?? 0);
  const waiting = Number(row.Waiting ?? 0);
  const completedToday = Number(row["Completed today"] ?? 0);
  if (delayed > 0) return "delayed";
  if (waiting > 0) return "waiting";
  if (completedToday > 0) return "completed";
  return null;
}

export function createStyledWorkbook() {
  return new ExcelJS.Workbook();
}

export async function workbookToBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

function autoFitColumns(ws: ExcelJS.Worksheet, maxWidth = 44) {
  ws.columns.forEach((column) => {
    if (!column) return;
    let maxLen = 10;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const v = cell.value;
      if (v == null) return;
      const len = String(v).length;
      if (len > maxLen) maxLen = len;
    });
    column.width = Math.min(maxLen + 2, maxWidth);
  });
}

export function addLegendSheet(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet("Legend");
  const header = ws.addRow(["Status", "Meaning"]);
  header.eachCell((cell) => fillCell(cell, HEADER.fg, HEADER.bg, true));

  for (const status of Object.keys(STATUS_STYLE) as OrderRowStatus[]) {
    const style = STATUS_STYLE[status];
    const row = ws.addRow([style.label, legendDescription(status)]);
    row.eachCell((cell, col) => {
      if (col === 1) {
        fillCell(cell, style.fg, style.bg, true);
      } else {
        fillCell(cell, "FF374151", "FFFFFFFF");
      }
    });
  }

  ws.getColumn(1).width = 18;
  ws.getColumn(2).width = 52;
}

function legendDescription(status: OrderRowStatus): string {
  switch (status) {
    case "completed":
      return "Delivered or closed.";
    case "partial":
      return "Part of the order was delivered; remainder still open.";
    case "delayed":
      return "Past delivery date and not yet finished.";
    case "in_transit":
      return "Loaded and on the road.";
    case "waiting":
      return "Assigned but not yet delivered.";
    case "pending":
      return "Not assigned or still at the warehouse.";
    case "cancelled":
      return "Order cancelled.";
  }
}

export function addSummarySheet(
  wb: ExcelJS.Workbook,
  name: string,
  rows: Record<string, string | number>[]
) {
  const ws = wb.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const header = ws.addRow(["Metric", "Value"]);
  header.eachCell((cell) => fillCell(cell, HEADER.fg, HEADER.bg, true));

  for (const row of rows) {
    const dataRow = ws.addRow([row.Metric ?? "", row.Value ?? ""]);
    fillCell(dataRow.getCell(1), SUMMARY_LABEL.fg, SUMMARY_LABEL.bg, true);
    fillCell(dataRow.getCell(2), SUMMARY_VALUE.fg, SUMMARY_VALUE.bg);
  }

  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 20;
}

export function addStyledDataSheet(
  wb: ExcelJS.Workbook,
  name: string,
  rows: Record<string, string | number>[],
  options?: {
    rowStatus?: (row: Record<string, string | number>) => OrderRowStatus | null;
    highlightColumn?: string;
  }
) {
  const ws = wb.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  if (rows.length === 0) {
    const row = ws.addRow(["No data"]);
    fillCell(row.getCell(1), "FF6B7280", "FFF9FAFB");
    return ws;
  }

  const headers = Object.keys(rows[0]!);
  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell) => fillCell(cell, HEADER.fg, HEADER.bg, true));

  const pipelineCol =
    options?.highlightColumn === "Pipeline"
      ? headers.indexOf("Pipeline") + 1
      : headers.indexOf("Pipeline") + 1;

  for (const row of rows) {
    const status = options?.rowStatus?.(row) ?? null;
    const style = status ? STATUS_STYLE[status] : null;
    const dataRow = ws.addRow(headers.map((h) => row[h] ?? ""));

    dataRow.eachCell((cell, colNumber) => {
      if (style) {
        const isPipeline = colNumber === pipelineCol;
        fillCell(
          cell,
          style.fg,
          style.bg,
          isPipeline
        );
      } else {
        fillCell(cell, "FF111827", "FFFFFFFF");
      }
    });
  }

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: rows.length + 1, column: headers.length },
  };
  autoFitColumns(ws);

  return ws;
}
