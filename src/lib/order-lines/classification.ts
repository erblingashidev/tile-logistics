export type OrderLineKind = "product" | "invoice_adjustment";

export const FURNIZIM_ADJUSTMENT_RE = /FURNIZIM\s+ME\s+(?:K|Q)?ERAMIK/i;

/** Prepaid / tile-change credit lines on AGIMI invoices — not shipped products. */
export function classifyOrderLineByName(name?: string | null): OrderLineKind {
  if (FURNIZIM_ADJUSTMENT_RE.test(name ?? "")) {
    return "invoice_adjustment";
  }
  return "product";
}

export function findFurnizimProductName(text: string): string | null {
  const match = text.match(/FURNIZIM\s+ME\s+(?:K|Q)?ERAMIK[A-ZËÉeë]*/i);
  return match?.[0]?.replace(/\s+/g, " ").trim() ?? null;
}

export function isInvoiceAdjustmentLine(item: {
  lineKind?: string | null;
  productName?: string | null;
}): boolean {
  if (item.lineKind === "invoice_adjustment") return true;
  return classifyOrderLineByName(item.productName) === "invoice_adjustment";
}

export function isLogisticsLine(item: {
  lineKind?: string | null;
  productName?: string | null;
}): boolean {
  return !isInvoiceAdjustmentLine(item);
}

/** Skip invalid product rows at parse time — adjustment lines may have negative qty. */
export function shouldSkipInvalidProductRow(
  name: string,
  quantity: number
): boolean {
  if (isInvoiceAdjustmentLine({ productName: name })) return false;
  if (quantity <= 0) return true;
  return false;
}

export function withLineKind<T extends { productName?: string; lineKind?: OrderLineKind; unit?: string; productEan?: string; linePrice?: number }>(
  item: T
): T & { lineKind: OrderLineKind } {
  const lineKind = item.lineKind ?? classifyOrderLineByName(item.productName);
  if (lineKind === "invoice_adjustment") {
    return sanitizeInvoiceAdjustmentItem({ ...item, lineKind }) as T & {
      lineKind: OrderLineKind;
    };
  }
  return {
    ...item,
    lineKind,
  };
}

/** Invoice-only credit lines — name, unit, optional EAN/price; no logistics fields. */
export function sanitizeInvoiceAdjustmentItem<
  T extends {
    productName?: string;
    unit?: string;
    productEan?: string;
    lineKind?: OrderLineKind;
    linePrice?: number;
  },
>(item: T): Pick<T, "productName" | "unit" | "productEan" | "linePrice"> & {
  lineKind: "invoice_adjustment";
} {
  return {
    productName: item.productName,
    unit: item.unit,
    productEan: item.productEan,
    linePrice: item.linePrice,
    lineKind: "invoice_adjustment",
  };
}
