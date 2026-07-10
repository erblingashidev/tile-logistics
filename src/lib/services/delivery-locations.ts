import { and, desc, eq, like, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll } from "@/lib/db/query";
import { orders } from "@/lib/db/schema";
import { isValidGeoCoord } from "@/lib/locations";

export interface RecentDeliveryLocation {
  id: string;
  name: string;
  city: string;
  region: string;
  lat: number;
  lng: number;
  source: "order";
  useCount: number;
}

/** Distinct delivery addresses from saved orders — powers autocomplete learning. */
export async function searchRecentDeliveryLocations(
  query: string,
  options?: { region?: string; limit?: number }
): Promise<RecentDeliveryLocation[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const db = await getDb();
  const limit = options?.limit ?? 12;

  const conditions = [
    sql`${orders.location} IS NOT NULL`,
    sql`trim(${orders.location}) != ''`,
    like(orders.location, `%${q}%`),
  ];

  if (options?.region?.trim()) {
    conditions.push(eq(orders.region, options.region.trim()));
  }

  const rows = await dbAll(
    db
      .select({
        location: orders.location,
        city: orders.city,
        region: orders.region,
        lat: orders.lat,
        lng: orders.lng,
        locationId: orders.locationId,
        useCount: sql<number>`count(*)`.as("use_count"),
        maxId: sql<number>`max(${orders.id})`.as("max_id"),
      })
      .from(orders)
      .where(and(...conditions))
      .groupBy(
        orders.location,
        orders.city,
        orders.region,
        orders.lat,
        orders.lng,
        orders.locationId
      )
      .orderBy(desc(sql`count(*)`))
      .limit(limit)
  );

  return rows
    .map((row, index) => {
      const lat = row.lat ?? null;
      const lng = row.lng ?? null;
      if (!isValidGeoCoord(lat, lng)) return null;
      const name = row.location?.trim() ?? "";
      if (!name) return null;
      return {
        id: row.locationId?.trim() || `order-addr-${row.maxId ?? index}`,
        name,
        city: row.city?.trim() || row.region?.trim() || "",
        region: row.region?.trim() || row.city?.trim() || "",
        lat: lat!,
        lng: lng!,
        source: "order" as const,
        useCount: Number(row.useCount ?? 1),
      };
    })
    .filter((row): row is RecentDeliveryLocation => row !== null);
}
