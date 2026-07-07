import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll, dbOne } from "@/lib/db/query";
import { employeeNotifications } from "@/lib/db/schema";

export type EmployeeNotificationType = "truck_arrived";

export interface EmployeeNotificationRow {
  id: number;
  type: EmployeeNotificationType;
  vehicleId: number | null;
  deliveryRound: number | null;
  message: string;
  readAt: string | null;
  createdAt: string;
}

export async function createEmployeeNotification(input: {
  employeeId: number;
  type: EmployeeNotificationType;
  vehicleId?: number | null;
  deliveryRound?: number | null;
  message: string;
}) {
  const db = await getDb();
  const now = new Date().toISOString();
  const row = await dbOne(
    db
      .insert(employeeNotifications)
      .values({
        employeeId: input.employeeId,
        type: input.type,
        vehicleId: input.vehicleId ?? undefined,
        deliveryRound: input.deliveryRound ?? undefined,
        message: input.message,
        createdAt: now,
      })
      .returning({
        id: employeeNotifications.id,
      })
  );
  return row?.id ?? null;
}

export async function listUnreadNotifications(
  employeeId: number
): Promise<EmployeeNotificationRow[]> {
  const db = await getDb();
  const rows = await dbAll(
    db
      .select({
        id: employeeNotifications.id,
        type: employeeNotifications.type,
        vehicleId: employeeNotifications.vehicleId,
        deliveryRound: employeeNotifications.deliveryRound,
        message: employeeNotifications.message,
        readAt: employeeNotifications.readAt,
        createdAt: employeeNotifications.createdAt,
      })
      .from(employeeNotifications)
      .where(
        and(
          eq(employeeNotifications.employeeId, employeeId),
          isNull(employeeNotifications.readAt)
        )
      )
      .orderBy(desc(employeeNotifications.createdAt))
  );

  return rows.map((row) => ({
    ...row,
    type: row.type as EmployeeNotificationType,
  }));
}

export async function markNotificationRead(
  notificationId: number,
  employeeId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = await getDb();
  const row = await dbOne(
    db
      .select({ id: employeeNotifications.id })
      .from(employeeNotifications)
      .where(
        and(
          eq(employeeNotifications.id, notificationId),
          eq(employeeNotifications.employeeId, employeeId)
        )
      )
  );
  if (!row) return { ok: false, error: "Notification not found" };

  await db
    .update(employeeNotifications)
    .set({ readAt: new Date().toISOString() })
    .where(eq(employeeNotifications.id, notificationId));

  return { ok: true };
}
