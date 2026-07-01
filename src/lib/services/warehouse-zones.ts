import { eq, and, ne, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll, dbOne } from "@/lib/db/query";
import {
  employeeWarehouseZones,
  employees,
  warehouseLocations,
} from "@/lib/db/schema";
import { WAREHOUSE_ZONE_PRESETS } from "@/lib/constants";
import { logActivity } from "@/lib/logger";

export function normalizeWarehouseZone(zone: string): string {
  return zone.trim();
}

export async function listDistinctWarehouseZones() {
  const db = await getDb();
  const rows = await dbAll(
    db
      .selectDistinct({ zone: warehouseLocations.zone })
      .from(warehouseLocations)
  );

  const fromLocations = rows
    .map((row) => row.zone?.trim())
    .filter((zone): zone is string => Boolean(zone));

  const merged = new Set<string>([...WAREHOUSE_ZONE_PRESETS, ...fromLocations]);
  return [...merged].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
}

export async function getEmployeeWarehouseZones(employeeId: number) {
  const db = await getDb();
  const rows = await dbAll(
    db
      .select({ zone: employeeWarehouseZones.zone })
      .from(employeeWarehouseZones)
      .where(eq(employeeWarehouseZones.employeeId, employeeId))
      .orderBy(employeeWarehouseZones.zone)
  );
  return rows.map((row) => row.zone);
}

export async function clearEmployeeWarehouseZones(employeeId: number) {
  const db = await getDb();
  await db
    .delete(employeeWarehouseZones)
    .where(eq(employeeWarehouseZones.employeeId, employeeId));
}

export async function setEmployeeWarehouseZones(
  employeeId: number,
  zones: string[],
  employeeName?: string
) {
  const normalized = [
    ...new Set(zones.map(normalizeWarehouseZone).filter(Boolean)),
  ];
  const db = await getDb();
  const now = new Date().toISOString();
  const current = await getEmployeeWarehouseZones(employeeId);
  const toRemove = current.filter((zone) => !normalized.includes(zone));

  if (toRemove.length > 0) {
    await db
      .delete(employeeWarehouseZones)
      .where(
        and(
          eq(employeeWarehouseZones.employeeId, employeeId),
          inArray(employeeWarehouseZones.zone, toRemove)
        )
      );
  }

  for (const zone of normalized) {
    await db
      .delete(employeeWarehouseZones)
      .where(
        and(
          eq(employeeWarehouseZones.zone, zone),
          ne(employeeWarehouseZones.employeeId, employeeId)
        )
      );

    const existing = await dbOne(
      db
        .select({ id: employeeWarehouseZones.id })
        .from(employeeWarehouseZones)
        .where(
          and(
            eq(employeeWarehouseZones.employeeId, employeeId),
            eq(employeeWarehouseZones.zone, zone)
          )
        )
    );

    if (!existing) {
      await db.insert(employeeWarehouseZones).values({
        employeeId,
        zone,
        assignedAt: now,
      });
    }
  }

  if (employeeName && (toRemove.length > 0 || normalized.length > 0)) {
    await logActivity(
      "update",
      "employee",
      employeeId,
      `Zone assignment for ${employeeName}: ${normalized.join(", ") || "none"}`,
      {
        category: "employees",
        details: { employeeId, zones: normalized, removed: toRemove },
      }
    );
  }

  return normalized;
}

export async function listWarehouseZonesWithLeaders() {
  const zones = await listDistinctWarehouseZones();
  const db = await getDb();

  const assignments = await dbAll(
    db
      .select({
        zone: employeeWarehouseZones.zone,
        employeeId: employees.id,
        employeeName: employees.name,
      })
      .from(employeeWarehouseZones)
      .innerJoin(employees, eq(employeeWarehouseZones.employeeId, employees.id))
  );

  const locationCounts = await dbAll(
    db
      .select({
        zone: warehouseLocations.zone,
        locationCount: sql<number>`count(*)`.as("locationCount"),
      })
      .from(warehouseLocations)
      .groupBy(warehouseLocations.zone)
  );

  const leaderByZone = new Map(
    assignments.map((row) => [
      row.zone,
      { id: row.employeeId, name: row.employeeName },
    ])
  );
  const countByZone = new Map(
    locationCounts
      .filter((row) => row.zone?.trim())
      .map((row) => [row.zone!.trim(), row.locationCount])
  );

  return zones.map((zone) => ({
    zone,
    leader: leaderByZone.get(zone) ?? null,
    locationCount: countByZone.get(zone) ?? 0,
  }));
}

export async function getGroupLeaderForZone(zone: string) {
  const normalized = normalizeWarehouseZone(zone);
  if (!normalized) return null;

  const db = await getDb();
  const row = await dbOne(
    db
      .select({
        employeeId: employees.id,
        employeeName: employees.name,
      })
      .from(employeeWarehouseZones)
      .innerJoin(employees, eq(employeeWarehouseZones.employeeId, employees.id))
      .where(eq(employeeWarehouseZones.zone, normalized))
  );

  return row
    ? { id: row.employeeId, name: row.employeeName }
    : null;
}
