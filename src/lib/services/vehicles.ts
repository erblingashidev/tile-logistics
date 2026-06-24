import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll, dbOne } from "@/lib/db/query";
import { vehicles } from "@/lib/db/schema";
import { logActivity } from "@/lib/logger";
import {
  formatStatusLabel,
  vehicleCreatedMessage,
  vehicleDeletedMessage,
  vehicleStatusMessage,
  vehicleUpdatedMessage,
} from "@/lib/log-messages";
import { getVehicleLoad } from "@/lib/services/orders";
import { getDriverForVehicle } from "@/lib/services/employees";
import { DELIVERY_ROUNDS } from "@/lib/constants";

export interface VehiclePayload {
  name: string;
  plateNumber: string;
  maxWeightKg: number;
  maxPallets: number;
  status?: string;
  notes?: string;
}

export async function listVehicles() {
  const db = await getDb();
  const rows = await dbAll(
    db.select().from(vehicles).orderBy(desc(vehicles.updatedAt))
  );
  return Promise.all(
    rows.map(async (v) => ({
      ...v,
      assignedDriver: await getDriverForVehicle(v.id),
      loads: await Promise.all(
        DELIVERY_ROUNDS.map(async (round) => ({
          round,
          ...(await getVehicleLoad(v.id, round)),
        }))
      ),
    }))
  );
}

export async function getVehicle(id: number) {
  const db = await getDb();
  const vehicle = await dbOne(
    db.select().from(vehicles).where(eq(vehicles.id, id))
  );
  if (!vehicle) return null;
  return {
    ...vehicle,
    assignedDriver: await getDriverForVehicle(id),
    loads: await Promise.all(
      DELIVERY_ROUNDS.map(async (round) => ({
        round,
        ...(await getVehicleLoad(id, round)),
      }))
    ),
  };
}

export async function createVehicle(payload: VehiclePayload) {
  const db = await getDb();
  const now = new Date().toISOString();
  const [inserted] = await db
    .insert(vehicles)
    .values({
      name: payload.name,
      plateNumber: payload.plateNumber,
      maxWeightKg: payload.maxWeightKg,
      maxPallets: payload.maxPallets,
      status: payload.status ?? "available",
      notes: payload.notes ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: vehicles.id });

  const id = inserted.id;
  await logActivity(
    "create",
    "vehicle",
    id,
    vehicleCreatedMessage(
      payload.name,
      payload.plateNumber,
      payload.maxPallets,
      payload.maxWeightKg
    ),
    {
      category: "vehicles",
      details: { name: payload.name, plateNumber: payload.plateNumber },
    }
  );
  return await getVehicle(id);
}

export async function updateVehicle(id: number, payload: Partial<VehiclePayload>) {
  const db = await getDb();
  const existing = await getVehicle(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const nextStatus = payload.status ?? existing.status;

  await db
    .update(vehicles)
    .set({
      name: payload.name ?? existing.name,
      plateNumber: payload.plateNumber ?? existing.plateNumber,
      maxWeightKg: payload.maxWeightKg ?? existing.maxWeightKg,
      maxPallets: payload.maxPallets ?? existing.maxPallets,
      status: nextStatus,
      notes: payload.notes ?? existing.notes,
      updatedAt: now,
    })
    .where(eq(vehicles.id, id));

  const statusChanged =
    payload.status != null && payload.status !== existing.status;

  if (statusChanged) {
    await logActivity(
      "status_change",
      "vehicle",
      id,
      vehicleStatusMessage(
        existing.name,
        existing.plateNumber,
        existing.status,
        nextStatus
      ),
      {
        category: "vehicles",
        details: {
          name: existing.name,
          plateNumber: existing.plateNumber,
          from: existing.status,
          to: nextStatus,
        },
      }
    );
  }

  const changes: string[] = [];
  if (payload.name && payload.name !== existing.name) {
    changes.push(`name → ${payload.name}`);
  }
  if (payload.plateNumber && payload.plateNumber !== existing.plateNumber) {
    changes.push(`plate → ${payload.plateNumber}`);
  }
  if (payload.maxPallets != null && payload.maxPallets !== existing.maxPallets) {
    changes.push(`max pallets ${existing.maxPallets} → ${payload.maxPallets}`);
  }
  if (
    payload.maxWeightKg != null &&
    payload.maxWeightKg !== existing.maxWeightKg
  ) {
    changes.push(
      `recommended kg ${existing.maxWeightKg} → ${payload.maxWeightKg}`
    );
  }
  if (payload.notes != null && payload.notes !== (existing.notes ?? "")) {
    changes.push("notes updated");
  }

  const nonStatusChanges = changes;

  if (nonStatusChanges.length > 0) {
    await logActivity(
      "update",
      "vehicle",
      id,
      vehicleUpdatedMessage(existing.name, existing.plateNumber, nonStatusChanges),
      { category: "vehicles", details: { changes: nonStatusChanges } }
    );
  }

  return await getVehicle(id);
}

export async function deleteVehicle(id: number) {
  const db = await getDb();
  const existing = await getVehicle(id);
  if (!existing) return false;
  await db.delete(vehicles).where(eq(vehicles.id, id));
  await logActivity(
    "delete",
    "vehicle",
    id,
    vehicleDeletedMessage(existing.name, existing.plateNumber),
    {
      category: "vehicles",
      details: { name: existing.name, plateNumber: existing.plateNumber },
    }
  );
  return true;
}

export async function updateVehicleStatus(id: number, status: string) {
  return updateVehicle(id, { status });
}

export { formatStatusLabel };
