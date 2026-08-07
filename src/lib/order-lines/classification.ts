export type OrderLineKind = "product" | "invoice_adjustment";

/** Prepaid / tile-change credit lines on AGIMI invoices — not shipped products. */
export function classifyOrderLineByName(name?: string | null): OrderLineKind {
  if (/FURNIZIM\s+ME\s+KERAMIK/i.test(name ?? "")) {
    return "invoice_adjustment";
  }
  return "product";
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

export function withLineKind<T extends { productName?: string; lineKind?: OrderLineKind }>(
  item: T
): T & { lineKind: OrderLineKind } {
  return {
    ...item,
    lineKind: item.lineKind ?? classifyOrderLineByName(item.productName),
  };
}
