import {
  KOSOVO_LOCATIONS,
  KOSOVO_MUNICIPALITIES,
  WAREHOUSE_LOCATION,
  type LocationEntry,
} from "./kosovo-locations";

export type { LocationEntry };
export {
  KOSOVO_LOCATIONS,
  KOSOVO_MUNICIPALITIES,
  WAREHOUSE_LOCATION,
};

/** @deprecated use KOSOVO_LOCATIONS */
export const ALBANIA_LOCATIONS = KOSOVO_LOCATIONS;

export const REGIONS = [...KOSOVO_MUNICIPALITIES].sort();
export const CITIES = [...new Set(KOSOVO_LOCATIONS.map((l) => l.city))].sort();

export function getCitiesByRegion(region: string): string[] {
  return [
    ...new Set(
      KOSOVO_LOCATIONS.filter((l) => l.region === region).map((l) => l.city)
    ),
  ].sort();
}

export function searchLocations(query: string, limit = 20): LocationEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [WAREHOUSE_LOCATION, ...KOSOVO_LOCATIONS.filter((l) => l.id !== WAREHOUSE_LOCATION.id)].slice(0, limit);
  }
  return KOSOVO_LOCATIONS.filter(
    (l) =>
      l.name.toLowerCase().includes(q) ||
      l.city.toLowerCase().includes(q) ||
      l.region.toLowerCase().includes(q) ||
      (l.postalCode?.includes(q) ?? false)
  ).slice(0, limit);
}

export function getLocationById(id: string): LocationEntry | undefined {
  return KOSOVO_LOCATIONS.find((l) => l.id === id);
}

const ALIASES: Record<string, string> = {
  prishtine: "prishtinë",
  prishtina: "prishtinë",
  pristina: "prishtinë",
  peja: "pejë",
  pec: "pejë",
  gjakova: "gjakovë",
  prizreni: "prizren",
  ferizaj: "ferizaj",
  gjilani: "gjilan",
  mitrovica: "mitrovicë",
  mitrovice: "mitrovicë",
  "mitrovice-kosova": "mitrovicë",
  "10000": "shkabaj",
  shkabaj: "shkabaj",
  agimi: "agimi-warehouse-shkabaj",
};

export function resolveLocation(text: string): LocationEntry | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;

  if (t.includes("agimi") && t.includes("shkabaj")) return WAREHOUSE_LOCATION;
  if (t.includes("shkabaj") || t.includes("10000")) {
    return (
      KOSOVO_LOCATIONS.find((l) => l.id === "shkabaj") ?? WAREHOUSE_LOCATION
    );
  }

  const alias = ALIASES[t];
  if (alias) {
    const byAlias = KOSOVO_LOCATIONS.find(
      (l) => l.id === alias || l.city.toLowerCase() === alias
    );
    if (byAlias) return byAlias;
  }

  const exact = KOSOVO_LOCATIONS.find(
    (l) => l.name.toLowerCase() === t || l.id === t
  );
  if (exact) return exact;

  const partial = KOSOVO_LOCATIONS.find(
    (l) =>
      l.name.toLowerCase().includes(t) ||
      t.includes(l.name.toLowerCase()) ||
      l.city.toLowerCase() === t ||
      t.includes(l.city.toLowerCase())
  );
  return partial ?? null;
}

/** Distance in km (Haversine) */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Distance from AGIMI warehouse at Shkabaj */
export function distanceFromWarehouse(loc: { lat: number; lng: number }): number {
  return distanceKm(WAREHOUSE_LOCATION, loc);
}

export interface NominatimResult {
  id: string;
  name: string;
  city: string;
  region: string;
  type: LocationEntry["type"];
  lat: number;
  lng: number;
  source: "nominatim";
}

/** Live search via OpenStreetMap Nominatim (Kosovo only) */
export async function searchNominatimKosovo(
  query: string,
  limit = 8
): Promise<NominatimResult[]> {
  if (!query.trim()) return [];
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("countrycodes", "xk");
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "AGIMI-Warehouse-Logistics/1.0 (tile-logistics app)",
    },
    next: { revalidate: 86400 },
  });

  if (!res.ok) return [];

  const data = (await res.json()) as Array<{
    place_id: number;
    lat: string;
    lon: string;
    display_name: string;
    type: string;
    address?: {
      city?: string;
      town?: string;
      village?: string;
      municipality?: string;
      county?: string;
      postcode?: string;
    };
  }>;

  return data.map((item) => {
    const city =
      item.address?.city ??
      item.address?.town ??
      item.address?.village ??
      item.address?.municipality ??
      "Kosovo";
    const region = item.address?.municipality ?? item.address?.county ?? city;
    const shortName = item.display_name.split(",")[0];
    return {
      id: `nominatim-${item.place_id}`,
      name: shortName,
      city,
      region,
      type: mapNominatimType(item.type),
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      source: "nominatim" as const,
    };
  });
}

function mapNominatimType(t: string): LocationEntry["type"] {
  if (t === "industrial") return "industrial";
  if (t === "commercial" || t === "retail") return "commercial";
  if (t === "village" || t === "hamlet") return "village";
  if (t === "suburb" || t === "neighbourhood") return "district";
  return "city";
}
