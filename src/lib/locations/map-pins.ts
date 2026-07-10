import { isValidGeoCoord, resolveOrderGeo } from "@/lib/locations";

export type MapPinPrecision = "street" | "city";

export interface OrderMapInput {
  id: number;
  invoiceNumber: string;
  customerName: string;
  location: string;
  city?: string | null;
  region?: string | null;
  lat?: number | null;
  lng?: number | null;
  locationId?: string | null;
  status?: string;
  requestedDeliveryDate?: string | null;
}

export interface MapPinOrderSummary {
  id: number;
  invoiceNumber: string;
  customerName: string;
  location: string;
  city?: string | null;
  region?: string | null;
}

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  precision: MapPinPrecision;
  count: number;
  orderIds: number[];
  label: string;
  city: string;
  region: string;
  orders: MapPinOrderSummary[];
}

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** True when delivery text looks like a street address, not just a city name. */
export function looksLikeStreetLocation(
  location: string,
  city?: string | null
): boolean {
  const loc = location.trim();
  if (!loc) return false;
  if (city && normalizeKey(loc) === normalizeKey(city)) return false;
  if (
    /\b(rruga|ruga|rr\.|street|st\.|sheshi|lagj|lagja|bulevard|bll\.|neighborhood|fshat)\b/i.test(
      loc
    )
  ) {
    return true;
  }
  if (/\d/.test(loc)) return true;
  return loc.length >= 14;
}

export function buildOrderMapPins(orders: OrderMapInput[]): MapPin[] {
  const streetPins: MapPin[] = [];
  const cityGroups = new Map<string, OrderMapInput[]>();

  for (const order of orders) {
    const geo = resolveOrderGeo(order);
    if (!geo) continue;

    const summary: MapPinOrderSummary = {
      id: order.id,
      invoiceNumber: order.invoiceNumber,
      customerName: order.customerName,
      location: order.location,
      city: order.city ?? geo.city,
      region: order.region ?? geo.region,
    };

    const hasExactCoords = isValidGeoCoord(order.lat, order.lng);
    const streetLevel =
      hasExactCoords &&
      looksLikeStreetLocation(order.location, order.city ?? geo.city);

    if (streetLevel) {
      streetPins.push({
        id: `order-${order.id}`,
        lat: order.lat!,
        lng: order.lng!,
        precision: "street",
        count: 1,
        orderIds: [order.id],
        label: order.location.trim(),
        city: order.city?.trim() || geo.city,
        region: order.region?.trim() || geo.region,
        orders: [summary],
      });
      continue;
    }

    const cityKey = `${normalizeKey(order.region ?? geo.region)}|${normalizeKey(order.city ?? geo.city)}`;
    const group = cityGroups.get(cityKey) ?? [];
    group.push(order);
    cityGroups.set(cityKey, group);
  }

  const cityPins: MapPin[] = [];
  for (const [cityKey, group] of cityGroups) {
    const geo = resolveOrderGeo(group[0]!);
    if (!geo) continue;
    cityPins.push({
      id: `city-${cityKey}`,
      lat: geo.lat,
      lng: geo.lng,
      precision: "city",
      count: group.length,
      orderIds: group.map((o) => o.id),
      label: group[0]!.city?.trim() || geo.city,
      city: group[0]!.city?.trim() || geo.city,
      region: group[0]!.region?.trim() || geo.region,
      orders: group.map((o) => ({
        id: o.id,
        invoiceNumber: o.invoiceNumber,
        customerName: o.customerName,
        location: o.location,
        city: o.city,
        region: o.region,
      })),
    });
  }

  return [...streetPins, ...cityPins];
}
