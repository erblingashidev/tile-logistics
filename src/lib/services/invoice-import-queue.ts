import fs from "fs";
import path from "path";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll, dbOne } from "@/lib/db/query";
import { invoiceImportQueue } from "@/lib/db/schema";
import {
  folderDateFromFilePath,
  folderDateLabelToIso,
  isDateFolderName,
} from "@/lib/invoices/folder-date";
import { parseAgimiExcel } from "@/lib/invoices/parse-agimi-excel";
import type { ParsedAgimiInvoice } from "@/lib/invoices/parse-agimi-invoice";
import {
  parsedInvoiceToFormState,
} from "@/lib/invoices/parse-agimi-invoice";
import {
  buildImportEntryFromParsed,
  createOrMergeFromEntry,
} from "@/lib/invoices/process-invoice-import";
import { findOrderByInvoiceNumber } from "@/lib/services/orders";

export type QueuedImportSnapshot = {
  parsed: ParsedAgimiInvoice;
  form: ReturnType<typeof parsedInvoiceToFormState>;
};

export type InvoiceImportQueueRow = {
  id: number;
  status: string;
  sourceFileName: string;
  sourceFilePath: string | null;
  sourceFolderDate: string | null;
  duplicateOrderId: number | null;
  errorMessage: string | null;
  orderId: number | null;
  adminNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  parsed: ParsedAgimiInvoice;
  form: ReturnType<typeof parsedInvoiceToFormState>;
  duplicateInvoiceNumber?: string;
};

function nowIso() {
  return new Date().toISOString();
}

function readSnapshot(raw: string): QueuedImportSnapshot {
  return JSON.parse(raw) as QueuedImportSnapshot;
}

function writeSnapshot(snapshot: QueuedImportSnapshot): string {
  return JSON.stringify(snapshot);
}

export function fileFingerprint(filePath: string, stat: fs.Stats): string {
  return `${filePath}|${stat.size}|${stat.mtimeMs}`;
}

function applyFolderDate(parsed: ParsedAgimiInvoice, folderIso: string | null) {
  if (!folderIso) return;
  parsed.orderDate = folderIso;
}

export async function enqueueExcelFile(
  filePath: string,
  options?: { folderDateIso?: string | null }
): Promise<
  | { ok: true; id: number; duplicate: boolean; skipped?: false }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string }
> {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    return { ok: false, error: "File not found" };
  }

  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) {
    return { ok: false, error: "Not a file" };
  }

  const lower = absolutePath.toLowerCase();
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
    return { ok: false, error: "Only Excel files are queued from the watch folder" };
  }

  const fingerprint = fileFingerprint(absolutePath, stat);
  const db = await getDb();
  const existing = await dbOne(
    db
      .select({ id: invoiceImportQueue.id, status: invoiceImportQueue.status })
      .from(invoiceImportQueue)
      .where(eq(invoiceImportQueue.fileFingerprint, fingerprint))
  );
  if (existing) {
    return {
      ok: true,
      skipped: true,
      reason: `Already queued (${existing.status})`,
    };
  }

  const folderIso =
    options?.folderDateIso ??
    folderDateFromFilePath(absolutePath) ??
    null;

  let parsed: ParsedAgimiInvoice;
  try {
    const buffer = fs.readFileSync(absolutePath);
    parsed = parseAgimiExcel(buffer, {
      sourceFileName: path.basename(absolutePath),
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not read Excel file",
    };
  }

  applyFolderDate(parsed, folderIso);

  if (!parsed.invoiceNumber && !parsed.customerName && parsed.items.length === 0) {
    return { ok: false, error: "Could not recognize invoice in Excel file" };
  }

  const snapshot: QueuedImportSnapshot = {
    parsed,
    form: parsedInvoiceToFormState(parsed),
  };

  const duplicateOrder = parsed.invoiceNumber
    ? await findOrderByInvoiceNumber(parsed.invoiceNumber)
    : null;

  const inserted = await dbOne(
    db
      .insert(invoiceImportQueue)
      .values({
        status: "pending",
        sourceFileName: path.basename(absolutePath),
        sourceFilePath: absolutePath,
        sourceFolderDate: folderIso,
        fileFingerprint: fingerprint,
        parsedJson: writeSnapshot(snapshot),
        duplicateOrderId: duplicateOrder?.id ?? null,
        errorMessage: null,
        submittedAt: nowIso(),
      })
      .returning({ id: invoiceImportQueue.id })
  );

  if (!inserted) {
    return { ok: false, error: "Failed to insert queue row" };
  }

  return {
    ok: true,
    id: inserted.id,
    duplicate: Boolean(duplicateOrder),
  };
}

export async function listImportQueue(
  status: "pending" | "approved" | "rejected" | "all" = "pending"
): Promise<InvoiceImportQueueRow[]> {
  const db = await getDb();
  const query = db
    .select()
    .from(invoiceImportQueue)
    .orderBy(desc(invoiceImportQueue.submittedAt))
    .limit(100);

  const rows =
    status === "all"
      ? await dbAll(query)
      : await dbAll(query.where(eq(invoiceImportQueue.status, status)));

  return rows.map((row) => {
    const snapshot = readSnapshot(row.parsedJson);
    return {
      id: row.id,
      status: row.status,
      sourceFileName: row.sourceFileName,
      sourceFilePath: row.sourceFilePath,
      sourceFolderDate: row.sourceFolderDate,
      duplicateOrderId: row.duplicateOrderId,
      errorMessage: row.errorMessage,
      orderId: row.orderId,
      adminNote: row.adminNote,
      submittedAt: row.submittedAt,
      reviewedAt: row.reviewedAt,
      parsed: snapshot.parsed,
      form: snapshot.form,
      duplicateInvoiceNumber: snapshot.parsed.invoiceNumber || undefined,
    };
  });
}

export async function approveImportQueueItem(
  id: number,
  options?: { merge?: boolean; invoiceNumberOverride?: string }
): Promise<
  | { ok: true; orderId: number; invoiceNumber: string; merged?: boolean }
  | { ok: false; error: string; status?: number }
> {
  const db = await getDb();
  const row = await dbOne(
    db.select().from(invoiceImportQueue).where(eq(invoiceImportQueue.id, id))
  );
  if (!row) return { ok: false, error: "Queue item not found", status: 404 };
  if (row.status !== "pending") {
    return { ok: false, error: `Already ${row.status}`, status: 409 };
  }

  const snapshot = readSnapshot(row.parsedJson);
  if (options?.invoiceNumberOverride?.trim()) {
    snapshot.parsed.invoiceNumber = options.invoiceNumberOverride.trim();
    snapshot.form.invoiceNumber = options.invoiceNumberOverride.trim();
  }

  const entry = await buildImportEntryFromParsed(snapshot.parsed);
  const result = await createOrMergeFromEntry(entry, {
    mergeIntoExisting: options?.merge === true,
    invoiceNumberOverride: options?.invoiceNumberOverride,
  });

  if (!result.ok) {
    await db
      .update(invoiceImportQueue)
      .set({
        errorMessage: result.error,
        reviewedAt: nowIso(),
      })
      .where(eq(invoiceImportQueue.id, id));
    return { ok: false, error: result.error, status: result.status };
  }

  if (!result.order) {
    return { ok: false, error: "Order was not created", status: 500 };
  }

  await db
    .update(invoiceImportQueue)
    .set({
      status: "approved",
      orderId: result.order.id,
      reviewedAt: nowIso(),
      errorMessage: null,
      parsedJson: writeSnapshot({
        parsed: entry.parsed,
        form: entry.form,
      }),
    })
    .where(eq(invoiceImportQueue.id, id));

  return {
    ok: true,
    orderId: result.order.id,
    invoiceNumber: result.order.invoiceNumber,
    merged: result.merged,
  };
}

export async function rejectImportQueueItem(
  id: number,
  adminNote?: string
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const db = await getDb();
  const row = await dbOne(
    db.select({ id: invoiceImportQueue.id, status: invoiceImportQueue.status })
      .from(invoiceImportQueue)
      .where(eq(invoiceImportQueue.id, id))
  );
  if (!row) return { ok: false, error: "Queue item not found", status: 404 };
  if (row.status !== "pending") {
    return { ok: false, error: `Already ${row.status}`, status: 409 };
  }

  await db
    .update(invoiceImportQueue)
    .set({
      status: "rejected",
      adminNote: adminNote?.trim() || null,
      reviewedAt: nowIso(),
    })
    .where(eq(invoiceImportQueue.id, id));

  return { ok: true };
}

export async function scanInvoiceWatchRoot(
  rootDir: string
): Promise<{ scanned: number; queued: number; skipped: number; errors: string[] }> {
  const absoluteRoot = path.resolve(rootDir);
  if (!fs.existsSync(absoluteRoot)) {
    return {
      scanned: 0,
      queued: 0,
      skipped: 0,
      errors: [`Watch folder not found: ${absoluteRoot}`],
    };
  }

  let scanned = 0;
  let queued = 0;
  let skipped = 0;
  const errors: string[] = [];

  const entries = fs.readdirSync(absoluteRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !isDateFolderName(entry.name)) continue;

    const folderIso = folderDateLabelToIso(entry.name);
    const folderPath = path.join(absoluteRoot, entry.name);
    const files = fs.readdirSync(folderPath, { withFileTypes: true });

    for (const file of files) {
      if (!file.isFile()) continue;
      const lower = file.name.toLowerCase();
      if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) continue;
      if (lower.startsWith("~$")) continue;

      scanned += 1;
      const filePath = path.join(folderPath, file.name);
      const result = await enqueueExcelFile(filePath, { folderDateIso: folderIso });
      if (!result.ok) {
        errors.push(`${file.name}: ${result.error}`);
      } else if ("skipped" in result && result.skipped) {
        skipped += 1;
      } else {
        queued += 1;
      }
    }
  }

  return { scanned, queued, skipped, errors };
}

export async function pendingImportQueueCount(): Promise<number> {
  const db = await getDb();
  const rows = await dbAll(
    db
      .select({ id: invoiceImportQueue.id })
      .from(invoiceImportQueue)
      .where(eq(invoiceImportQueue.status, "pending"))
  );
  return rows.length;
}

export async function bulkRejectImportQueue(
  ids: number[],
  adminNote?: string
): Promise<number> {
  if (ids.length === 0) return 0;
  const db = await getDb();
  await db
    .update(invoiceImportQueue)
    .set({
      status: "rejected",
      adminNote: adminNote?.trim() || null,
      reviewedAt: nowIso(),
    })
    .where(inArray(invoiceImportQueue.id, ids));
  return ids.length;
}
