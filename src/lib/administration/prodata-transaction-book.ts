import * as XLSX from "xlsx";
import { documentKindFromInvoiceNumber } from "@/lib/invoices/parse-agimi-invoice";
import type { AdminPaymentMethod } from "@/lib/administration/constants";

/** Pro-Data “Libri i transaksioneve” / Pro-Data Export sheet. */
export const PRODATA_TRANSACTION_BOOK_HEADERS = [
  "transaksioni",
  "data",
  "bleres",
  "shifra",
  "emertimi",
  "agjenti tregtar",
  "sasia",
  "njesia matese",
  "cmimi_shit",
  "vlera_shit",
  "menyra e pageses",
] as const;

export type FinanceDocumentCategory =
  | "sale"
  | "credit_note"
  | "delivery_note"
  | "pro_forma"
  | "other";

export type ProDataTransactionLine = {
  invoiceNumber: string;
  transactionDate: string;
  buyerName: string;
  productCode: string;
  description: string;
  salesAgentName: string;
  quantity: number | null;
  unit: string;
  unitPrice: number | null;
  lineValueEuros: number;
  paymentMethodRaw: string;
};

export type ProDataInvoiceAggregate = {
  invoiceNumber: string;
  documentCategory: FinanceDocumentCategory;
  transactionDate: string;
  buyerName: string;
  salesAgentName: string;
  netValueEuros: number;
  netValueCents: number;
  lineCount: number;
  paymentMethodRaw: string;
  paymentMethod: AdminPaymentMethod | null;
  productSample: string;
};

export type ProDataImportAnalysis = {
  format: "prodata_transaction_book";
  fileName: string;
  sheetName: string;
  rowCount: number;
  columns: string[];
  sampleRows: string[][];
  dateFrom: string | null;
  dateTo: string | null;
  invoices: ProDataInvoiceAggregate[];
  byCategory: Record<
    FinanceDocumentCategory,
    { count: number; totalEuros: number }
  >;
  byAgent: Array<{ salesAgentName: string; invoiceCount: number; totalEuros: number }>;
  paymentsDetected: number;
  openSalesCount: number;
};

function normalizeHeader(cell: unknown): string {
  return String(cell ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

function parseEuroNumber(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw).trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function excelCellToIsoDate(raw: unknown): string | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (parsed) {
      const d = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
      return d.toISOString().slice(0, 10);
    }
  }
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

export function financeDocumentCategory(
  invoiceNumber: string,
  netEuros: number
): FinanceDocumentCategory {
  const upper = invoiceNumber.toUpperCase();
  if (/-NOKR/i.test(upper) || netEuros < -0.001) return "credit_note";
  const kind = documentKindFromInvoiceNumber(invoiceNumber);
  if (kind === "pro_forma") return "pro_forma";
  if (kind === "sales_invoice") return "sale";
  if (kind === "delivery_note") return "delivery_note";
  if (/-SHT/i.test(upper)) return "delivery_note";
  return "other";
}

export function financeDocumentCategoryLabel(
  category: FinanceDocumentCategory
): string {
  switch (category) {
    case "sale":
      return "Sales invoice";
    case "credit_note":
      return "Credit note / return";
    case "delivery_note":
      return "Delivery note";
    case "pro_forma":
      return "Pro-forma";
    default:
      return "Other";
  }
}

/** Map Pro-Data payment labels to register payment methods. */
export function mapProDataPaymentMethod(
  raw: string
): AdminPaymentMethod | null {
  const s = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (!s) return null;
  if (/^(arke|arka|cash|kesh|para\s*ne\s*dor)/i.test(s)) return "cash";
  if (/^(kart|card|kredi|pos|banke.*kart)/i.test(s)) return "card";
  if (/^(banke|transfer|bank|wire|swift)/i.test(s)) return "bank_transfer";
  if (/^(pa\s*pag|borxh|kredi\s*klient|me\s*borxh|unpaid|on\s*account)/i.test(s))
    return "unpaid";
  return "other";
}

function detectProDataHeaderMap(headerRow: unknown[]): Map<string, number> | null {
  const map = new Map<string, number>();
  headerRow.forEach((cell, i) => {
    const key = normalizeHeader(cell);
    if (key) map.set(key, i);
  });
  const required = ["transaksioni", "bleres", "vlera_shit"];
  if (!required.every((k) => map.has(k))) return null;
  return map;
}

export function isProDataTransactionBookHeaders(columns: string[]): boolean {
  const normalized = columns.map((c) => normalizeHeader(c));
  return (
    normalized.includes("transaksioni") &&
    normalized.includes("bleres") &&
    normalized.includes("vlera_shit")
  );
}

function readSheetRows(buffer: Buffer): {
  sheetName: string;
  rows: unknown[][];
} {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName =
    workbook.SheetNames.find((n) => /pro-?data|export|transaksion/i.test(n)) ??
    workbook.SheetNames[0];
  if (!sheetName) throw new Error("Workbook has no sheets.");
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("Could not read the sheet.");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
  });
  return { sheetName, rows };
}

export function parseProDataTransactionBook(
  buffer: Buffer,
  fileName: string
): ProDataImportAnalysis {
  const { sheetName, rows } = readSheetRows(buffer);
  if (rows.length === 0) throw new Error("Sheet is empty.");

  const headerMap = detectProDataHeaderMap(rows[0] ?? []);
  if (!headerMap) {
    throw new Error(
      "Not a Pro-Data transaction book — expected columns Transaksioni, Bleres, Vlera_shit."
    );
  }

  const col = (key: string) => headerMap.get(key)!;
  const columns = (rows[0] ?? []).map((cell, i) => {
    const label = String(cell ?? "").trim();
    return label || `Column ${i + 1}`;
  });

  const lines: ProDataTransactionLine[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const invoiceNumber = String(row[col("transaksioni")] ?? "").trim();
    if (!invoiceNumber) continue;
    const lineValue = parseEuroNumber(row[col("vlera_shit")]) ?? 0;
    const buyerName = String(row[col("bleres")] ?? "").trim();
    if (!buyerName) continue;

    lines.push({
      invoiceNumber,
      transactionDate:
        excelCellToIsoDate(row[col("data")]) ??
        new Date().toISOString().slice(0, 10),
      buyerName,
      productCode: String(row[col("shifra")] ?? "").trim(),
      description: String(row[col("emertimi")] ?? "").trim(),
      salesAgentName: String(row[col("agjenti tregtar")] ?? "").trim(),
      quantity: parseEuroNumber(row[col("sasia")]),
      unit: String(row[col("njesia matese")] ?? "").trim(),
      unitPrice: parseEuroNumber(row[col("cmimi_shit")]),
      lineValueEuros: lineValue,
      paymentMethodRaw: String(row[col("menyra e pageses")] ?? "").trim(),
    });
  }

  if (lines.length === 0) {
    throw new Error("No transaction lines found under the header row.");
  }

  const byInvoice = new Map<string, ProDataTransactionLine[]>();
  for (const line of lines) {
    const list = byInvoice.get(line.invoiceNumber) ?? [];
    list.push(line);
    byInvoice.set(line.invoiceNumber, list);
  }

  const invoices: ProDataInvoiceAggregate[] = [];
  for (const [invoiceNumber, group] of byInvoice) {
    const netValueEuros = group.reduce((s, l) => s + l.lineValueEuros, 0);
    const paymentMethods = [
      ...new Set(group.map((l) => l.paymentMethodRaw.trim()).filter(Boolean)),
    ];
    const paymentMethodRaw =
      paymentMethods.length === 1 ? paymentMethods[0]! : paymentMethods.join(", ");
    const primary = group[0]!;
    invoices.push({
      invoiceNumber,
      documentCategory: financeDocumentCategory(invoiceNumber, netValueEuros),
      transactionDate: primary.transactionDate,
      buyerName: primary.buyerName,
      salesAgentName: primary.salesAgentName,
      netValueEuros,
      netValueCents: Math.round(netValueEuros * 100),
      lineCount: group.length,
      paymentMethodRaw,
      paymentMethod: mapProDataPaymentMethod(paymentMethodRaw),
      productSample: primary.description || primary.productCode,
    });
  }

  invoices.sort((a, b) =>
    (b.transactionDate + b.invoiceNumber).localeCompare(
      a.transactionDate + a.invoiceNumber
    )
  );

  const byCategory: ProDataImportAnalysis["byCategory"] = {
    sale: { count: 0, totalEuros: 0 },
    credit_note: { count: 0, totalEuros: 0 },
    delivery_note: { count: 0, totalEuros: 0 },
    pro_forma: { count: 0, totalEuros: 0 },
    other: { count: 0, totalEuros: 0 },
  };
  for (const inv of invoices) {
    const bucket = byCategory[inv.documentCategory];
    bucket.count += 1;
    bucket.totalEuros += inv.netValueEuros;
  }

  const agentMap = new Map<string, { count: number; total: number }>();
  for (const inv of invoices) {
    const agent = inv.salesAgentName.trim() || "— Unassigned —";
    const prev = agentMap.get(agent) ?? { count: 0, total: 0 };
    agentMap.set(agent, {
      count: prev.count + 1,
      total: prev.total + inv.netValueEuros,
    });
  }
  const byAgent = [...agentMap.entries()]
    .map(([salesAgentName, v]) => ({
      salesAgentName,
      invoiceCount: v.count,
      totalEuros: v.total,
    }))
    .sort((a, b) => b.totalEuros - a.totalEuros);

  const dates = invoices.map((i) => i.transactionDate).filter(Boolean);
  dates.sort();

  const sampleRows = lines.slice(0, 8).map((l) => [
    l.invoiceNumber,
    l.transactionDate,
    l.buyerName,
    l.productCode,
    l.description,
    l.salesAgentName,
    l.quantity != null ? String(l.quantity) : "",
    l.unit,
    l.unitPrice != null ? String(l.unitPrice) : "",
    String(l.lineValueEuros),
    l.paymentMethodRaw,
  ]);

  let paymentsDetected = 0;
  let openSalesCount = 0;
  for (const inv of invoices) {
    if (inv.paymentMethod) paymentsDetected += 1;
    else if (inv.documentCategory === "sale" && inv.netValueEuros > 0) {
      openSalesCount += 1;
    }
  }

  return {
    format: "prodata_transaction_book",
    fileName,
    sheetName,
    rowCount: lines.length,
    columns,
    sampleRows,
    dateFrom: dates[0] ?? null,
    dateTo: dates[dates.length - 1] ?? null,
    invoices,
    byCategory,
    byAgent,
    paymentsDetected,
    openSalesCount,
  };
}
