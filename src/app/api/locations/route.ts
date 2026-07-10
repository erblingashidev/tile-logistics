import { NextRequest, NextResponse } from "next/server";
import {
  CITIES,
  KOSOVO_MUNICIPALITIES,
  REGIONS,
  WAREHOUSE_LOCATION,
  getCitiesByRegion,
  reverseNominatimKosovo,
  searchLocations,
  searchNominatimKosovo,
} from "@/lib/locations";
import { searchRecentDeliveryLocations } from "@/lib/services/delivery-locations";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const live = sp.get("live") === "true";
  const recent = sp.get("recent") === "true";
  const region = sp.get("region") ?? undefined;

  if (sp.get("reverse") === "true") {
    const lat = Number(sp.get("lat"));
    const lng = Number(sp.get("lng"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
    }
    const result = await reverseNominatimKosovo(lat, lng);
    return NextResponse.json({ location: result });
  }

  const local = searchLocations(q, 25);
  let nominatim: Awaited<ReturnType<typeof searchNominatimKosovo>> = [];
  let fromOrders: Awaited<ReturnType<typeof searchRecentDeliveryLocations>> = [];

  if (live && q.trim().length >= 2) {
    try {
      nominatim = await searchNominatimKosovo(q, 10);
    } catch {
      nominatim = [];
    }
  }

  if (recent && q.trim().length >= 2) {
    try {
      fromOrders = await searchRecentDeliveryLocations(q, { region, limit: 12 });
    } catch {
      fromOrders = [];
    }
  }

  const seen = new Set<string>();
  const merged = [];

  for (const entry of [
    ...fromOrders.map((o) => ({
      id: o.id,
      name: o.name,
      city: o.city,
      region: o.region,
      lat: o.lat,
      lng: o.lng,
      source: "order" as const,
    })),
    ...local.map((l) => ({ ...l, source: "catalog" as const })),
    ...nominatim.map((n) => ({ ...n, source: "nominatim" as const })),
  ]) {
    const key = `${entry.name.toLowerCase()}|${entry.lat}|${entry.lng}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }

  return NextResponse.json({
    warehouse: WAREHOUSE_LOCATION,
    locations: merged.slice(0, 30),
    regions: REGIONS,
    municipalities: KOSOVO_MUNICIPALITIES,
    cities: CITIES,
    citiesByRegion: sp.get("region")
      ? getCitiesByRegion(sp.get("region")!)
      : undefined,
    source:
      "OpenStreetMap + saved order addresses (Nominatim live search & reverse)",
  });
}
