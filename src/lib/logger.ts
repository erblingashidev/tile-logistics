import { getDb } from "@/lib/db";
import { activityLogs } from "@/lib/db/schema";
import type { LogCategory } from "@/lib/log-messages";

export async function logActivity(
  action: string,
  entityType: string,
  entityId: number | null,
  message: string,
  options?: {
    category?: LogCategory;
    details?: Record<string, unknown>;
  }
) {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.insert(activityLogs).values({
    action,
    entityType,
    entityId: entityId ?? undefined,
    category: options?.category,
    message,
    details: options?.details ? JSON.stringify(options.details) : null,
    createdAt: now,
  });
}
