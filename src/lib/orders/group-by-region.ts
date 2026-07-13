/** Region / city bucket for order lists (matches Orders board grouping). */
export interface OrderRegionFields {
  region?: string | null;
  city?: string | null;
  location?: string | null;
}

export function orderRegionKey(order: OrderRegionFields): string {
  return (
    order.region?.trim() ||
    order.city?.trim() ||
    order.location?.trim() ||
    "Unknown"
  );
}

export function groupOrdersByRegion<T extends OrderRegionFields>(
  orders: T[],
  sortOrders?: (a: T, b: T) => number
): Array<{ region: string; orders: T[] }> {
  const map = new Map<string, T[]>();
  for (const order of orders) {
    const key = orderRegionKey(order);
    const bucket = map.get(key) ?? [];
    bucket.push(order);
    map.set(key, bucket);
  }

  const defaultSort = (a: T, b: T) => {
    const aInvoice = (a as { invoiceNumber?: string }).invoiceNumber ?? "";
    const bInvoice = (b as { invoiceNumber?: string }).invoiceNumber ?? "";
    return aInvoice.localeCompare(bInvoice);
  };
  const compare = sortOrders ?? defaultSort;

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map(([region, regionOrders]) => ({
      region,
      orders: [...regionOrders].sort(compare),
    }));
}
