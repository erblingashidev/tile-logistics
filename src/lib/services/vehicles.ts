import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll, dbOne } from "@/lib/db/query";
import { vehicles } from "@/lib/db/schema";
import {
  DEFAULT_VEHICLE_CATEGORY,
  normalizeVehicleCategory,
  isTransportVehicle,
  SALES_VEHICLE_MAX_PALLETS,
  SALES_VEHICLE_MAX_WEIGHT_KG,
  type VehicleCategory,
  VEHICLE_CATEGORY_LABELS,
} from "@/lib/constants";
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

export type { VehicleCategory };

export interface VehiclePayload {
  name: string;
  plateNumber: string;
  maxWeightKg?: number;
  maxPallets?: number;
  status?: string;
  category?: VehicleCategory;
  notes?: string;
}

export interface ListVehiclesOptions {
  /** Shorthand: only warehouse delivery trucks (dispatch / order assignment). */
  forTransport?: boolean;
  /** Filter by category; default returns all vehicles. */
  category?: VehicleCategory | "all";
}

export { isTransportVehicle };

function resolveVehicleCapacity(
  category: VehicleCategory,
  payload: { maxWeightKg?: number; maxPallets?: number },
  existing?: { maxWeightKg: number; maxPallets: number }
): { maxWeightKg: number; maxPallets: number } {
  if (category === "sales") {
    return {
      maxWeightKg: SALES_VEHICLE_MAX_WEIGHT_KG,
      maxPallets: SALES_VEHICLE_MAX_PALLETS,
    };
  }
  return {
    maxWeightKg: payload.maxWeightKg ?? existing?.maxWeightKg ?? 3000,
    maxPallets: payload.maxPallets ?? existing?.maxPallets ?? 8,
  };
}

async function hydrateVehicles(
  rows: (typeof vehicles.$inferSelect)[]
) {
  return Promise.all(
    rows.map(async (v) => {
      const category = normalizeVehicleCategory(v.category);
      return {
        ...v,
        category,
        assignedDriver: await getDriverForVehicle(v.id),
        loads: isTransportVehicle({ category })
          ? await Promise.all(
              DELIVERY_ROUNDS.map(async (round) => ({
                round,
                ...(await getVehicleLoad(v.id, round)),
              }))
            )
          : [],
      };
    })
  );
}

export async function listVehicles(options?: ListVehiclesOptions) {
  const db = await getDb();
  let rows = await dbAll(
    db.select().from(vehicles).orderBy(desc(vehicles.updatedAt))
  );

  if (options?.forTransport || options?.category === "delivery") {
    rows = rows.filter(isTransportVehicle);
  } else if (options?.category === "sales") {
    rows = rows.filter((v) => normalizeVehicleCategory(v.category) === "sales");
  }

  return hydrateVehicles(rows);
}

export async function listTransportVehicles() {
  return listVehicles({ forTransport: true });
}

export async function getVehicle(id: number) {
  const db = await getDb();
  const vehicle = await dbOne(
    db.select().from(vehicles).where(eq(vehicles.id, id))
  );
  if (!vehicle) return null;
  const [hydrated] = await hydrateVehicles([vehicle]);
  return hydrated;
}

export async function createVehicle(payload: VehiclePayload) {
  const db = await getDb();
  const now = new Date().toISOString();
  const category = normalizeVehicleCategory(
    payload.category ?? DEFAULT_VEHICLE_CATEGORY
  );
  const capacity = resolveVehicleCapacity(category, payload);
  const [inserted] = await db
    .insert(vehicles)
    .values({
      name: payload.name,
      plateNumber: payload.plateNumber,
      maxWeightKg: capacity.maxWeightKg,
      maxPallets: capacity.maxPallets,
      status: payload.status ?? "available",
      category,
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
      capacity.maxPallets,
      capacity.maxWeightKg
    ),
    {
      category: "vehicles",
      details: {
        name: payload.name,
        plateNumber: payload.plateNumber,
        vehicleCategory: category,
      },
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
  const nextCategory = normalizeVehicleCategory(
    payload.category ?? existing.category
  );
  const capacity = resolveVehicleCapacity(nextCategory, payload, existing);

  await db
    .update(vehicles)
    .set({
      name: payload.name ?? existing.name,
      plateNumber: payload.plateNumber ?? existing.plateNumber,
      maxWeightKg: capacity.maxWeightKg,
      maxPallets: capacity.maxPallets,
      status: nextStatus,
      category: nextCategory,
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
  if (
    nextCategory === "delivery" &&
    payload.maxPallets != null &&
    payload.maxPallets !== existing.maxPallets
  ) {
    changes.push(`max pallets ${existing.maxPallets} → ${payload.maxPallets}`);
  }
  if (
    nextCategory === "delivery" &&
    payload.maxWeightKg != null &&
    payload.maxWeightKg !== existing.maxWeightKg
  ) {
    changes.push(
      `recommended kg ${existing.maxWeightKg} → ${payload.maxWeightKg}`
    );
  }
  if (payload.category && nextCategory !== existing.category) {
    changes.push(
      `category ${VEHICLE_CATEGORY_LABELS[existing.category as VehicleCategory] ?? existing.category} → ${VEHICLE_CATEGORY_LABELS[nextCategory]}`
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
