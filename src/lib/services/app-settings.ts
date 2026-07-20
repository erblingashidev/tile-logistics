import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbOne } from "@/lib/db/query";
import { appSettings } from "@/lib/db/schema";

function nowIso() {
  return new Date().toISOString();
}

export async function getAppSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await dbOne(
    db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, key))
  );
  const value = row?.value?.trim();
  return value || null;
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  const trimmed = value.trim();
  const updatedAt = nowIso();

  const existing = await dbOne(
    db
      .select({ key: appSettings.key })
      .from(appSettings)
      .where(eq(appSettings.key, key))
  );

  if (existing) {
    await db
      .update(appSettings)
      .set({ value: trimmed, updatedAt })
      .where(eq(appSettings.key, key));
    return;
  }

  await db.insert(appSettings).values({ key, value: trimmed, updatedAt });
}

export async function deleteAppSetting(key: string): Promise<void> {
  const db = await getDb();
  await db.delete(appSettings).where(eq(appSettings.key, key));
}

/** Invoice watch folder — set INVOICE_WATCH_DIR where the import service runs. */
export async function getInvoiceWatchRoot(): Promise<string | null> {
  const fromEnv = process.env.INVOICE_WATCH_DIR?.trim();
  return fromEnv || null;
}
