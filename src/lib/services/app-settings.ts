import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbOne } from "@/lib/db/query";
import { appSettings } from "@/lib/db/schema";

export const INVOICE_WATCH_ROOT_KEY = "invoice_watch_root";

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
  await db
    .insert(appSettings)
    .values({ key, value: trimmed, updatedAt })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: trimmed, updatedAt },
    });
}

/** Folder path saved in Settings (per deployment). Falls back to INVOICE_WATCH_DIR env. */
export async function getInvoiceWatchRoot(): Promise<string | null> {
  const fromDb = await getAppSetting(INVOICE_WATCH_ROOT_KEY);
  if (fromDb) return fromDb;
  const fromEnv = process.env.INVOICE_WATCH_DIR?.trim();
  return fromEnv || null;
}

export async function setInvoiceWatchRoot(path: string): Promise<void> {
  await setAppSetting(INVOICE_WATCH_ROOT_KEY, path);
}

export async function getInvoiceImportSettings() {
  const watchRoot = await getInvoiceWatchRoot();
  return {
    watchRoot: watchRoot ?? "",
    configured: Boolean(watchRoot),
  };
}
