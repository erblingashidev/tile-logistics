import fs from "fs";
import path from "path";
import { eq, and, sql } from "drizzle-orm";
import { getDb, hasDeliveryProofDbPhotos } from "@/lib/db";
import { dbAll, dbOne } from "@/lib/db/query";
import { deliveryProofs, employees, orders, assignments, orderEmployeeAssignments } from "@/lib/db/schema";
import {
  DELIVERY_PROOF_PHASES,
  type DeliveryProofPhase,
  type EmployeeRole,
} from "@/lib/constants";
import { logActivity } from "@/lib/logger";
import { deliveryProofMessage } from "@/lib/log-messages";
import { getUploadRoot, isNetlify } from "@/lib/config/env";
import { getOrderStaff } from "@/lib/services/employees";
import {
  syncAfterOrderDelivered,
  syncAfterTruckDeparture,
} from "@/lib/services/truck-workspace";
import { updateOrderStatus } from "@/lib/services/order-status";
import {
  assertTruckReadyForDriverDeparture,
  getOrderLoadStatus,
  getTruckLoadStatus,
  isDriverAuthorizedForOrder,
  orderHasDeparted,
  orderWasLoaded,
} from "@/lib/services/load-coordination";

const UPLOAD_ROOT = getUploadRoot();

const LOADER_PHASES = new Set<DeliveryProofPhase>(["loaded", "load_skipped"]);

type StoredProofPhoto = {
  photoPath: string | null;
  photoData: Buffer | null;
  photoMime: string | null;
};

function useDatabaseProofPhotos(): boolean {
  return isNetlify();
}

function hasStoredPhoto(photo: StoredProofPhoto): boolean {
  return Boolean(photo.photoPath || photo.photoData);
}

function storeProofPhoto(
  orderId: number,
  phase: string,
  file: Buffer,
  mimeType: string
): StoredProofPhoto {
  if (useDatabaseProofPhotos()) {
    return { photoPath: null, photoData: file, photoMime: mimeType };
  }

  const photoPath = saveProofPhoto(orderId, phase, file, mimeType);
  if (photoPath) {
    return { photoPath, photoData: null, photoMime: null };
  }

  return { photoPath: null, photoData: file, photoMime: mimeType };
}

function proofPhotoUrl(proof: {
  id: number;
  photoPath: string | null;
  hasDbPhoto?: boolean;
}) {
  if (proof.photoPath) return `/api/uploads/${proof.photoPath}`;
  if (proof.hasDbPhoto) return `/api/uploads/proof/${proof.id}`;
  return null;
}

export function ensureUploadDir(orderId: number) {
  const dir = path.join(UPLOAD_ROOT, String(orderId));
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    console.error("[upload] ensureUploadDir failed:", err);
    throw err;
  }
  return dir;
}

export function saveProofPhoto(
  orderId: number,
  phase: string,
  file: Buffer,
  mimeType: string
): string | null {
  try {
    const ext =
      mimeType === "image/png"
        ? "png"
        : mimeType === "image/webp"
          ? "webp"
          : "jpg";
    const filename = `${Date.now()}-${phase}.${ext}`;
    const dir = ensureUploadDir(orderId);
    const fullPath = path.join(dir, filename);
    fs.writeFileSync(fullPath, file);
    return path.join(String(orderId), filename);
  } catch (err) {
    console.error("[upload] saveProofPhoto failed:", err);
    return null;
  }
}

export function getProofPhotoPath(relativePath: string) {
  return path.join(UPLOAD_ROOT, relativePath);
}

export async function getDeliveryProofPhoto(proofId: number) {
  const db = await getDb();
  const row = await dbOne(
    db
      .select({
        photoData: deliveryProofs.photoData,
        photoMime: deliveryProofs.photoMime,
        photoPath: deliveryProofs.photoPath,
      })
      .from(deliveryProofs)
      .where(eq(deliveryProofs.id, proofId))
  );
  if (!row) return null;

  if (row.photoData) {
    const buffer =
      row.photoData instanceof Buffer
        ? row.photoData
        : Buffer.from(row.photoData as Uint8Array);
    return {
      buffer,
      mimeType: row.photoMime || "image/jpeg",
    };
  }

  if (row.photoPath) {
    const fullPath = getProofPhotoPath(row.photoPath);
    if (!fs.existsSync(fullPath)) return null;
    const ext = path.extname(fullPath).toLowerCase();
    const mimeType =
      ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : "image/jpeg";
    return { buffer: fs.readFileSync(fullPath), mimeType };
  }

  return null;
}

export async function listDeliveryProofs(orderId: number) {
  const db = await getDb();
  const selectFields = {
    id: deliveryProofs.id,
    orderId: deliveryProofs.orderId,
    phase: deliveryProofs.phase,
    photoPath: deliveryProofs.photoPath,
    notes: deliveryProofs.notes,
    lat: deliveryProofs.lat,
    lng: deliveryProofs.lng,
    capturedAt: deliveryProofs.capturedAt,
    createdAt: deliveryProofs.createdAt,
    employeeId: deliveryProofs.employeeId,
    employeeName: employees.name,
    ...(hasDeliveryProofDbPhotos()
      ? {
          hasDbPhoto: sql<boolean>`${deliveryProofs.photoData} IS NOT NULL`.as(
            "has_db_photo"
          ),
        }
      : {}),
  };

  const rows = await dbAll(
    db
      .select(selectFields)
      .from(deliveryProofs)
      .innerJoin(employees, eq(deliveryProofs.employeeId, employees.id))
      .where(eq(deliveryProofs.orderId, orderId))
      .orderBy(deliveryProofs.capturedAt)
  );
  return rows.map((p) => ({
    ...p,
    photoUrl: proofPhotoUrl(p),
  }));
}

async function pickerOnSameTruck(
  employeeId: number,
  orderId: number
): Promise<boolean> {
  const db = await getDb();
  const target = await dbOne(
    db
      .select({
        vehicleId: assignments.vehicleId,
        deliveryRound: assignments.deliveryRound,
      })
      .from(assignments)
      .where(eq(assignments.orderId, orderId))
  );
  if (!target?.vehicleId) return false;

  const mate = await dbOne(
    db
      .select({ id: orderEmployeeAssignments.id })
      .from(orderEmployeeAssignments)
      .innerJoin(
        assignments,
        eq(assignments.orderId, orderEmployeeAssignments.orderId)
      )
      .where(
        and(
          eq(orderEmployeeAssignments.employeeId, employeeId),
          sql`${orderEmployeeAssignments.role} IN ('picker', 'unloader')`,
          eq(assignments.vehicleId, target.vehicleId),
          eq(assignments.deliveryRound, target.deliveryRound)
        )
      )
  );
  return Boolean(mate);
}

async function employeeCanSubmitPhase(
  employeeId: number,
  employeeRoles: EmployeeRole[],
  orderId: number,
  phase: DeliveryProofPhase
) {
  const phaseDef = DELIVERY_PROOF_PHASES.find((p) => p.id === phase);
  if (!phaseDef) return { ok: false as const, error: "Invalid phase" };

  const roleOk = phaseDef.roles.some((r) => employeeRoles.includes(r));
  if (!roleOk) {
    return {
      ok: false as const,
      error: `Your role cannot submit "${phaseDef.label}"`,
    };
  }

  const staff = await getOrderStaff(orderId);
  const onOrder =
    staff.staff.some((s) => s.employeeId === employeeId) ||
    staff.driver?.employeeId === employeeId ||
    (await isDriverAuthorizedForOrder(orderId, employeeId));
  const onSameTruck =
    LOADER_PHASES.has(phase) &&
    (employeeRoles.includes("picker") || employeeRoles.includes("unloader")) &&
    (await pickerOnSameTruck(employeeId, orderId));

  if (!onOrder && !onSameTruck) {
    return { ok: false as const, error: "You are not assigned to this order" };
  }

  return { ok: true as const, phaseDef };
}

async function insertProofRecord(input: {
  orderId: number;
  employeeId: number;
  phase: DeliveryProofPhase;
  photoPath: string | null;
  photoData?: Buffer | null;
  photoMime?: string | null;
  notes?: string;
  lat?: number;
  lng?: number;
}) {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.insert(deliveryProofs).values({
    orderId: input.orderId,
    employeeId: input.employeeId,
    phase: input.phase,
    photoPath: input.photoPath,
    photoData: input.photoData ?? null,
    photoMime: input.photoMime ?? null,
    notes: input.notes?.trim() || null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    capturedAt: now,
    createdAt: now,
  });
}

async function logProof(
  order: { invoiceNumber: string },
  orderId: number,
  phaseLabel: string,
  employeeName: string,
  phase: string,
  employeeId: number,
  hasPhoto: boolean
) {
  await logActivity(
    "delivery_proof",
    "order",
    orderId,
    deliveryProofMessage(order.invoiceNumber, phaseLabel, employeeName),
    {
      category: "deliveries",
      details: {
        invoiceNumber: order.invoiceNumber,
        phase,
        employeeId,
        hasPhoto,
      },
    }
  );
}

/** Driver leaves warehouse — only loaded orders go in transit. */
async function departTruckForOrder(
  triggerOrderId: number,
  driverEmployeeId: number,
  photoBuffer?: Buffer,
  photoMime?: string,
  lat?: number,
  lng?: number
) {
  const ready = await assertTruckReadyForDriverDeparture(triggerOrderId);
  if (!ready.ok) {
    return { ok: false as const, error: ready.error, truck: ready.truck };
  }

  const { truck } = ready;
  const db = await getDb();
  const driver = await dbOne(
    db
      .select({ name: employees.name })
      .from(employees)
      .where(eq(employees.id, driverEmployeeId))
  );

  const ordersToDepart = truck.orders.filter((o) => o.awaitingDepart);

  for (const truckOrder of ordersToDepart) {
    const order = await dbOne(
      db.select().from(orders).where(eq(orders.id, truckOrder.orderId))
    );
    if (!order) continue;

    const existing = await dbOne(
      db
        .select({
          id: deliveryProofs.id,
          phase: deliveryProofs.phase,
        })
        .from(deliveryProofs)
        .where(
          and(
            eq(deliveryProofs.orderId, truckOrder.orderId),
            eq(deliveryProofs.phase, "departed")
          )
        )
    );
    if (existing) continue;

    let storedPhoto: StoredProofPhoto = {
      photoPath: null,
      photoData: null,
      photoMime: null,
    };
    if (photoBuffer && photoMime && truckOrder.orderId === triggerOrderId) {
      storedPhoto = storeProofPhoto(
        truckOrder.orderId,
        "departed",
        photoBuffer,
        photoMime
      );
    }

    await insertProofRecord({
      orderId: truckOrder.orderId,
      employeeId: driverEmployeeId,
      phase: "departed",
      ...storedPhoto,
      lat,
      lng,
    });

    await updateOrderStatus(truckOrder.orderId, "in_transit", driverEmployeeId);

    await logProof(
      order,
      truckOrder.orderId,
      "Left warehouse / on the way",
      driver?.name ?? "Driver",
      "departed",
      driverEmployeeId,
      hasStoredPhoto(storedPhoto)
    );
  }

  await syncAfterTruckDeparture(truck.vehicleId, driverEmployeeId);

  return {
    ok: true as const,
    truck: await getTruckLoadStatus(truck.vehicleId, truck.deliveryRound),
    departedOrderIds: ordersToDepart.map((o) => o.orderId),
  };
}

export async function submitDeliveryProof(input: {
  orderId: number;
  employeeId: number;
  employeeRoles: EmployeeRole[];
  phase: DeliveryProofPhase;
  photoBuffer?: Buffer;
  photoMime?: string;
  notes?: string;
  lat?: number;
  lng?: number;
}) {
  const check = await employeeCanSubmitPhase(
    input.employeeId,
    input.employeeRoles,
    input.orderId,
    input.phase
  );
  if (!check.ok) return check;

  const { phaseDef } = check;

  if (phaseDef.notesRequired && !input.notes?.trim()) {
    return {
      ok: false as const,
      error: "Please explain why this order could not be loaded.",
    };
  }

  if (phaseDef.photoRequired && !input.photoBuffer) {
    return { ok: false as const, error: "Photo is required for delivery proof" };
  }

  const db = await getDb();
  const order = await dbOne(
    db.select().from(orders).where(eq(orders.id, input.orderId))
  );
  if (!order) return { ok: false as const, error: "Order not found" };

  const loadStatus = await getOrderLoadStatus(input.orderId);

  if (LOADER_PHASES.has(input.phase)) {
    if (loadStatus.loadStatus === "loaded" && input.phase === "load_skipped") {
      return { ok: false as const, error: "This order is already marked as loaded." };
    }
    if (loadStatus.loadStatus === "load_skipped" && input.phase === "loaded") {
      return {
        ok: false as const,
        error: "Loader already marked this order as cannot load. Contact admin to change.",
      };
    }
  }

  if (input.phase === "departed") {
    if (!(await isDriverAuthorizedForOrder(input.orderId, input.employeeId))) {
      return {
        ok: false as const,
        error: "You are not the driver for this truck",
      };
    }
    return departTruckForOrder(
      input.orderId,
      input.employeeId,
      input.photoBuffer,
      input.photoMime,
      input.lat,
      input.lng
    );
  }

  if (input.phase === "arrived" || input.phase === "delivered") {
    if (!(await orderWasLoaded(input.orderId))) {
      return {
        ok: false as const,
        error: "This order was not loaded on the truck — no delivery steps needed.",
      };
    }
    if (!(await orderHasDeparted(input.orderId))) {
      return {
        ok: false as const,
        error: "Truck has not left the warehouse yet for this order.",
      };
    }
  }

  const existing = await dbOne(
    db
      .select({ id: deliveryProofs.id })
      .from(deliveryProofs)
      .where(
        and(
          eq(deliveryProofs.orderId, input.orderId),
          eq(deliveryProofs.phase, input.phase)
        )
      )
  );
  if (existing) {
    return {
      ok: false as const,
      error: `"${phaseDef.label}" was already recorded for this order`,
    };
  }

  let storedPhoto: StoredProofPhoto = {
    photoPath: null,
    photoData: null,
    photoMime: null,
  };
  let photoWarning: string | undefined;
  if (input.photoBuffer && input.photoMime) {
    storedPhoto = storeProofPhoto(
      input.orderId,
      input.phase,
      input.photoBuffer,
      input.photoMime
    );
    if (!hasStoredPhoto(storedPhoto)) {
      if (phaseDef.photoRequired) {
        return {
          ok: false as const,
          error:
            "Photo could not be saved on the server. Try again or contact admin.",
        };
      }
      photoWarning =
        "Proof saved without photo — server storage unavailable.";
    } else if (!storedPhoto.photoPath && storedPhoto.photoData) {
      photoWarning =
        "Proof saved with photo stored in database (server disk unavailable).";
    }
  }

  const employee = await dbOne(
    db
      .select({ name: employees.name })
      .from(employees)
      .where(eq(employees.id, input.employeeId))
  );

  await insertProofRecord({
    orderId: input.orderId,
    employeeId: input.employeeId,
    phase: input.phase,
    ...storedPhoto,
    notes: input.notes,
    lat: input.lat,
    lng: input.lng,
  });

  await updateOrderStatus(input.orderId, phaseDef.nextOrderStatus, input.employeeId);

  await logProof(
    order,
    input.orderId,
    phaseDef.label,
    employee?.name ?? "Employee",
    input.phase,
    input.employeeId,
    hasStoredPhoto(storedPhoto)
  );

  if (input.phase === "delivered") {
    await syncAfterOrderDelivered(input.orderId);
  }

  return {
    ok: true as const,
    proofs: await listDeliveryProofs(input.orderId),
    orderStatus: phaseDef.nextOrderStatus,
    warning: photoWarning,
  };
}

export function getProofPhasesForRoles(roles: EmployeeRole[]) {
  return DELIVERY_PROOF_PHASES.filter((p) =>
    p.roles.some((r) => roles.includes(r))
  );
}

/** Admin reset — removes all proof rows (photos remain on disk). */
export async function deleteDeliveryProofsForOrder(orderId: number): Promise<number> {
  const db = await getDb();
  const rows = await dbAll(
    db
      .select({ id: deliveryProofs.id })
      .from(deliveryProofs)
      .where(eq(deliveryProofs.orderId, orderId))
  );
  await db
    .delete(deliveryProofs)
    .where(eq(deliveryProofs.orderId, orderId));
  return rows.length;
}
