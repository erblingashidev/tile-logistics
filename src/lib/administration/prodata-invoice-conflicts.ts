import type {
  ProDataInvoiceAggregate,
  ProDataTransactionLine,
} from "@/lib/administration/prodata-transaction-book";
import type { ProDataFinanceInvoiceRow } from "@/lib/services/finance-prodata-import";

export type InvoiceConflictVariant = {
  source: "excel_line" | "stored" | "excel_total";
  transactionDate?: string;
  buyerName?: string;
  netValueCents?: number;
  paymentMethodRaw?: string;
  salesAgentName?: string;
  detail?: string;
};

export type InvoiceNumberConflict = {
  invoiceNumber: string;
  variants: InvoiceConflictVariant[];
};

function variantKey(v: InvoiceConflictVariant): string {
  return [
    v.source,
    v.transactionDate ?? "",
    v.buyerName ?? "",
    v.netValueCents ?? "",
    v.paymentMethodRaw ?? "",
    v.salesAgentName ?? "",
    v.detail ?? "",
  ].join("|");
}

function pushVariant(
  map: Map<string, InvoiceNumberConflict>,
  invoiceNumber: string,
  variant: InvoiceConflictVariant
) {
  const key = invoiceNumber.trim();
  if (!key) return;
  let row = map.get(key);
  if (!row) {
    row = { invoiceNumber: key, variants: [] };
    map.set(key, row);
  }
  const sig = variantKey(variant);
  if (row.variants.some((v) => variantKey(v) === sig)) return;
  row.variants.push(variant);
}

/** Same invoice # with differing line-level facts in one Excel file. */
export function detectExcelLineConflicts(
  lines: ProDataTransactionLine[]
): InvoiceNumberConflict[] {
  const byInv = new Map<string, ProDataTransactionLine[]>();
  for (const line of lines) {
    const list = byInv.get(line.invoiceNumber) ?? [];
    list.push(line);
    byInv.set(line.invoiceNumber, list);
  }
  const map = new Map<string, InvoiceNumberConflict>();
  for (const [invoiceNumber, group] of byInv) {
    for (const line of group) {
      pushVariant(map, invoiceNumber, {
        source: "excel_line",
        transactionDate: line.transactionDate,
        buyerName: line.buyerName,
        netValueCents: Math.round(line.lineValueEuros * 100),
        paymentMethodRaw: line.paymentMethodRaw,
        salesAgentName: line.salesAgentName,
        detail: line.description || line.productCode,
      });
    }
  }
  return [...map.values()].filter((c) => c.variants.length > 1);
}

export function detectStoredImportConflicts(
  incoming: ProDataInvoiceAggregate[],
  stored: ProDataFinanceInvoiceRow[]
): InvoiceNumberConflict[] {
  const byNum = new Map(
    stored.map((r) => [r.invoiceNumber.trim().toLowerCase(), r])
  );
  const map = new Map<string, InvoiceNumberConflict>();
  for (const inv of incoming) {
    const prev = byNum.get(inv.invoiceNumber.trim().toLowerCase());
    if (!prev) continue;
    pushVariant(map, inv.invoiceNumber, {
      source: "excel_total",
      transactionDate: inv.transactionDate,
      buyerName: inv.buyerName,
      netValueCents: inv.netValueCents,
      paymentMethodRaw: inv.paymentMethodRaw,
      salesAgentName: inv.salesAgentName ?? undefined,
    });
    pushVariant(map, inv.invoiceNumber, {
      source: "stored",
      transactionDate: prev.transactionDate,
      buyerName: prev.buyerName,
      netValueCents: prev.netValueCents,
      paymentMethodRaw: prev.paymentMethodRaw ?? undefined,
      salesAgentName: prev.salesAgentName ?? undefined,
    });
  }
  return [...map.values()].filter((c) => c.variants.length > 1);
}

export function mergeInvoiceConflicts(
  ...groups: InvoiceNumberConflict[][]
): InvoiceNumberConflict[] {
  const map = new Map<string, InvoiceNumberConflict>();
  for (const group of groups) {
    for (const c of group) {
      for (const v of c.variants) {
        pushVariant(map, c.invoiceNumber, v);
      }
    }
  }
  return [...map.values()].filter((c) => c.variants.length > 1);
}

export function normalizeBusinessDay(raw: string | null | undefined): string | null {
  const d = (raw ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return d;
}

export function todayBusinessDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export function invoiceMatchesBusinessDay(
  transactionDate: string | null | undefined,
  orderDate: string | null | undefined,
  day: string
): boolean {
  const pro = normalizeBusinessDay(transactionDate);
  if (pro === day) return true;
  const ord = normalizeBusinessDay(orderDate);
  return ord === day;
}
