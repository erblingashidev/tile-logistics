import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll, dbOne } from "@/lib/db/query";
import { vehicleMaintenanceRecords, vehicles } from "@/lib/db/schema";
import { logActivity } from "@/lib/logger";

export type MaintenanceDueStatus = "ok" | "due_soon" | "overdue" | "unknown";

export interface MaintenanceRecordInput {
  vehicleId: number;
  performedAt: string;
  nextDueAt?: string | null;
  workDone: string;
  cost: number;
  notes?: string | null;
}

const DUE_SOON_DAYS = 30;

export function parseDateOnly(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(`${trimmed.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function maintenanceDueStatus(
  nextDueAt: string | null | undefined,
  today = new Date()
): MaintenanceDueStatus {
  if (!nextDueAt?.trim()) return "unknown";
  const due = parseDateOnly(nextDueAt);
  if (!due) return "unknown";

  const start = new Date(today);
  start.setHours(12, 0, 0, 0);
  const diffDays = Math.ceil(
    (due.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays < 0) return "overdue";
  if (diffDays <= DUE_SOON_DAYS) return "due_soon";
  return "ok";
}

function enrichRecord(
  row: typeof vehicleMaintenanceRecords.$inferSelect,
  vehicle: { id: number; name: string; plateNumber: string }
) {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    vehicleName: vehicle.name,
    plateNumber: vehicle.plateNumber,
    performedAt: row.performedAt,
    nextDueAt: row.nextDueAt,
    workDone: row.workDone,
    cost: row.cost,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    dueStatus: maintenanceDueStatus(row.nextDueAt),
  };
}

export async function listMaintenanceRecords(vehicleId?: number) {
  const db = await getDb();
  const query = db
    .select({
      record: vehicleMaintenanceRecords,
      vehicleName: vehicles.name,
      plateNumber: vehicles.plateNumber,
    })
    .from(vehicleMaintenanceRecords)
    .innerJoin(vehicles, eq(vehicleMaintenanceRecords.vehicleId, vehicles.id))
    .orderBy(desc(vehicleMaintenanceRecords.performedAt));

  const rows = await dbAll(
    vehicleId != null
      ? query.where(eq(vehicleMaintenanceRecords.vehicleId, vehicleId))
      : query
  );

  return rows.map((row) =>
    enrichRecord(row.record, {
      id: row.record.vehicleId,
      name: row.vehicleName,
      plateNumber: row.plateNumber,
    })
  );
}

export async function listVehicleMaintenanceOverview() {
  const db = await getDb();
  const fleet = await dbAll(db.select().from(vehicles).orderBy(vehicles.name));
  const records = await listMaintenanceRecords();

  const byVehicle = new Map<
    number,
    Awaited<ReturnType<typeof listMaintenanceRecords>>
  >();
  for (const record of records) {
    const list = byVehicle.get(record.vehicleId) ?? [];
    list.push(record);
    byVehicle.set(record.vehicleId, list);
  }

  return fleet.map((vehicle) => {
    const vehicleRecords = byVehicle.get(vehicle.id) ?? [];
    const latest = vehicleRecords[0] ?? null;
    const totalCost = vehicleRecords.reduce((sum, r) => sum + r.cost, 0);

    return {
      vehicleId: vehicle.id,
      name: vehicle.name,
      plateNumber: vehicle.plateNumber,
      status: vehicle.status,
      recordCount: vehicleRecords.length,
      totalCost,
      latest,
      nextDueAt: latest?.nextDueAt ?? null,
      lastPerformedAt: latest?.performedAt ?? null,
      dueStatus: maintenanceDueStatus(latest?.nextDueAt),
      records: vehicleRecords,
    };
  });
}

export async function getMaintenanceDashboardStats() {
  const overview = await listVehicleMaintenanceOverview();
  const overdue = overview.filter((v) => v.dueStatus === "overdue").length;
  const dueSoon = overview.filter((v) => v.dueStatus === "due_soon").length;
  const totalCost = overview.reduce((sum, v) => sum + v.totalCost, 0);
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const monthCost = overview
    .flatMap((v) => v.records)
    .filter((r) => r.performedAt >= monthStart)
    .reduce((sum, r) => sum + r.cost, 0);

  return { overdue, dueSoon, totalCost, monthCost, vehicleCount: overview.length };
}

export async function createMaintenanceRecord(input: MaintenanceRecordInput) {
  const workDone = input.workDone.trim();
  if (!workDone) {
    return { ok: false as const, error: "Describe what was changed." };
  }
  if (!parseDateOnly(input.performedAt)) {
    return { ok: false as const, error: "Invalid service date." };
  }
  if (input.nextDueAt && !parseDateOnly(input.nextDueAt)) {
    return { ok: false as const, error: "Invalid next due date." };
  }

  const db = await getDb();
  const vehicle = await dbOne(
    db.select().from(vehicles).where(eq(vehicles.id, input.vehicleId))
  );
  if (!vehicle) {
    return { ok: false as const, error: "Vehicle not found." };
  }

  const now = new Date().toISOString();
  const inserted = await dbOne(
    db
      .insert(vehicleMaintenanceRecords)
      .values({
        vehicleId: input.vehicleId,
        performedAt: input.performedAt.slice(0, 10),
        nextDueAt: input.nextDueAt?.slice(0, 10) || null,
        workDone,
        cost: input.cost >= 0 ? input.cost : 0,
        notes: input.notes?.trim() || null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: vehicleMaintenanceRecords.id })
  );

  await logActivity(
    "create",
    "vehicle_maintenance",
    inserted!.id,
    `Maintenance logged for ${vehicle.name}: ${workDone.slice(0, 80)}`,
    {
      category: "system",
      details: {
        vehicleId: input.vehicleId,
        cost: input.cost,
        nextDueAt: input.nextDueAt,
      },
    }
  );

  const row = await dbOne(
    db
      .select()
      .from(vehicleMaintenanceRecords)
      .where(eq(vehicleMaintenanceRecords.id, inserted!.id))
  );

  return {
    ok: true as const,
    record: enrichRecord(row!, {
      id: vehicle.id,
      name: vehicle.name,
      plateNumber: vehicle.plateNumber,
    }),
  };
}

export async function updateMaintenanceRecord(
  id: number,
  input: Partial<MaintenanceRecordInput>
) {
  const db = await getDb();
  const existing = await dbOne(
    db
      .select()
      .from(vehicleMaintenanceRecords)
      .where(eq(vehicleMaintenanceRecords.id, id))
  );
  if (!existing) {
    return { ok: false as const, error: "Record not found." };
  }

  const workDone =
    input.workDone !== undefined ? input.workDone.trim() : existing.workDone;
  if (!workDone) {
    return { ok: false as const, error: "Describe what was changed." };
  }

  const performedAt = input.performedAt ?? existing.performedAt;
  if (!parseDateOnly(performedAt)) {
    return { ok: false as const, error: "Invalid service date." };
  }

  const nextDueAt =
    input.nextDueAt !== undefined
      ? input.nextDueAt?.slice(0, 10) || null
      : existing.nextDueAt;

  if (nextDueAt && !parseDateOnly(nextDueAt)) {
    return { ok: false as const, error: "Invalid next due date." };
  }

  const now = new Date().toISOString();
  await db
    .update(vehicleMaintenanceRecords)
    .set({
      ...(input.vehicleId !== undefined ? { vehicleId: input.vehicleId } : {}),
      performedAt: performedAt.slice(0, 10),
      nextDueAt,
      workDone,
      ...(input.cost !== undefined
        ? { cost: input.cost >= 0 ? input.cost : 0 }
        : {}),
      ...(input.notes !== undefined
        ? { notes: input.notes?.trim() || null }
        : {}),
      updatedAt: now,
    })
    .where(eq(vehicleMaintenanceRecords.id, id));

  const vehicle = await dbOne(
    db.select().from(vehicles).where(eq(vehicles.id, existing.vehicleId))
  );
  const row = await dbOne(
    db
      .select()
      .from(vehicleMaintenanceRecords)
      .where(eq(vehicleMaintenanceRecords.id, id))
  );

  return {
    ok: true as const,
    record: enrichRecord(row!, {
      id: vehicle!.id,
      name: vehicle!.name,
      plateNumber: vehicle!.plateNumber,
    }),
  };
}

export async function deleteMaintenanceRecord(id: number) {
  const db = await getDb();
  const existing = await dbOne(
    db
      .select()
      .from(vehicleMaintenanceRecords)
      .where(eq(vehicleMaintenanceRecords.id, id))
  );
  if (!existing) {
    return { ok: false as const, error: "Record not found." };
  }

  await db
    .delete(vehicleMaintenanceRecords)
    .where(eq(vehicleMaintenanceRecords.id, id));

  await logActivity(
    "delete",
    "vehicle_maintenance",
    id,
    `Deleted maintenance record #${id}`,
    { category: "system", details: { vehicleId: existing.vehicleId } }
  );

  return { ok: true as const, id };
}
