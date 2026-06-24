import { NextRequest, NextResponse } from "next/server";
import {
  CITIES,
  KOSOVO_MUNICIPALITIES,
  REGIONS,
  WAREHOUSE_LOCATION,
  getCitiesByRegion,
  searchLocations,
  searchNominatimKosovo,
} from "@/lib/locations";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const live = sp.get("live") === "true";

  const local = searchLocations(q, 25);
  let nominatim: Awaited<ReturnType<typeof searchNominatimKosovo>> = [];

  if (live && q.trim().length >= 2) {
    try {
      nominatim = await searchNominatimKosovo(q, 10);
    } catch {
      nominatim = [];
    }
  }

  const seen = new Set(local.map((l) => l.name.toLowerCase()));
  const merged = [
    ...local,
    ...nominatim.filter((n) => !seen.has(n.name.toLowerCase())),
  ];

  return NextResponse.json({
    warehouse: WAREHOUSE_LOCATION,
    locations: merged,
    regions: REGIONS,
    municipalities: KOSOVO_MUNICIPALITIES,
    cities: CITIES,
    citiesByRegion: sp.get("region")
      ? getCitiesByRegion(sp.get("region")!)
      : undefined,
    source: "OpenStreetMap (Geofabrik Kosovo + Nominatim live search)",
  });
}
