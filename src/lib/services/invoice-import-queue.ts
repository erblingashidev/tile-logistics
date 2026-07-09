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
  if (row.status !== "pending" && row.status !== "rejected") {
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

export async function restoreImportQueueItem(
  id: number
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const db = await getDb();
  const row = await dbOne(
    db.select({ id: invoiceImportQueue.id, status: invoiceImportQueue.status })
      .from(invoiceImportQueue)
      .where(eq(invoiceImportQueue.id, id))
  );
  if (!row) return { ok: false, error: "Queue item not found", status: 404 };
  if (row.status !== "rejected") {
    return { ok: false, error: `Cannot restore — status is ${row.status}`, status: 409 };
  }

  await db
    .update(invoiceImportQueue)
    .set({
      status: "pending",
      reviewedAt: null,
      adminNote: null,
      errorMessage: null,
    })
    .where(eq(invoiceImportQueue.id, id));

  return { ok: true };
}

function pathIsUnderRoot(filePath: string, root: string): boolean {
  const resolvedFile = path.resolve(filePath);
  const resolvedRoot = path.resolve(root);
  if (process.platform === "win32") {
    const fileLower = resolvedFile.toLowerCase();
    const rootLower = resolvedRoot.toLowerCase();
    return fileLower === rootLower || fileLower.startsWith(`${rootLower}${path.sep}`);
  }
  return (
    resolvedFile === resolvedRoot ||
    resolvedFile.startsWith(`${resolvedRoot}${path.sep}`)
  );
}

/** Remove pending/declined queue rows when the source Excel file was deleted from disk. */
export async function purgeImportQueueMissingFiles(
  watchRoot: string
): Promise<number> {
  const absoluteRoot = path.resolve(watchRoot);
  if (!fs.existsSync(absoluteRoot)) return 0;

  const db = await getDb();
  const rows = await dbAll(
    db
      .select({
        id: invoiceImportQueue.id,
        sourceFilePath: invoiceImportQueue.sourceFilePath,
      })
      .from(invoiceImportQueue)
      .where(inArray(invoiceImportQueue.status, ["pending", "rejected"]))
  );

  let purged = 0;
  for (const row of rows) {
    const sourcePath = row.sourceFilePath?.trim();
    if (!sourcePath) continue;
    if (!pathIsUnderRoot(sourcePath, absoluteRoot)) continue;
    if (fs.existsSync(sourcePath)) continue;
    await db
      .delete(invoiceImportQueue)
      .where(eq(invoiceImportQueue.id, row.id));
    purged += 1;
  }
  return purged;
}

export async function deleteImportQueueItem(
  id: number
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const db = await getDb();
  const row = await dbOne(
    db
      .select({ id: invoiceImportQueue.id, status: invoiceImportQueue.status })
      .from(invoiceImportQueue)
      .where(eq(invoiceImportQueue.id, id))
  );
  if (!row) return { ok: false, error: "Queue item not found", status: 404 };
  if (row.status === "approved") {
    return {
      ok: false,
      error: "Approved imports cannot be removed from the queue",
      status: 409,
    };
  }

  await db.delete(invoiceImportQueue).where(eq(invoiceImportQueue.id, id));
  return { ok: true };
}

async function finalizeScanResult(
  absoluteRoot: string,
  result: {
    scanned: number;
    queued: number;
    skipped: number;
    errors: string[];
    hint?: string;
    watching?: string;
    dateFolders?: string[];
  }
) {
  const purged = await purgeImportQueueMissingFiles(absoluteRoot);
  return { ...result, purged };
}

export async function scanInvoiceWatchRoot(
  rootDir: string
): Promise<{
  scanned: number;
  queued: number;
  skipped: number;
  purged: number;
  errors: string[];
  hint?: string;
  watching?: string;
  dateFolders?: string[];
}> {
  const absoluteRoot = path.resolve(rootDir);
  if (!fs.existsSync(absoluteRoot)) {
    const isWinPath = /^[A-Za-z]:[\\/]/.test(absoluteRoot);
    return {
      scanned: 0,
      queued: 0,
      skipped: 0,
      purged: 0,
      errors: [`Folder not found on this computer: ${absoluteRoot}`],
      hint: isWinPath
        ? "Scan only works on the Windows PC where that folder exists. Run npm run watch:invoices:turso there — not from the cloud website."
        : "Check INVOICE_WATCH_DIR in .env.local. Use the main Faturat-Logistics folder, or a date folder like 09.07.2026.",
    };
  }

  let scanned = 0;
  let queued = 0;
  let skipped = 0;
  const errors: string[] = [];

  async function scanDirectory(dirPath: string, folderIso: string | null) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (err) {
      errors.push(
        `Cannot read ${dirPath}: ${err instanceof Error ? err.message : "access denied"}`
      );
      return;
    }

    for (const file of entries) {
      if (!file.isFile()) continue;
      const lower = file.name.toLowerCase();
      if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) continue;
      if (lower.startsWith("~$")) continue;

      scanned += 1;
      const filePath = path.join(dirPath, file.name);
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

  const rootName = path.basename(absoluteRoot);

  // User pointed directly at a date folder (e.g. ...\09.07.2026)
  if (isDateFolderName(rootName)) {
    await scanDirectory(absoluteRoot, folderDateLabelToIso(rootName));
    return finalizeScanResult(absoluteRoot, {
      scanned,
      queued,
      skipped,
      errors,
      hint:
        scanned === 0 && errors.length === 0
          ? `No Excel files (.xlsx) found in ${rootName}. Save Pro-Data exports there, then scan again.`
          : undefined,
      watching: absoluteRoot,
      dateFolders: [rootName],
    });
  }

  // Main folder: scan each DD.MM.YYYY subfolder
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absoluteRoot, { withFileTypes: true });
  } catch (err) {
    return finalizeScanResult(absoluteRoot, {
      scanned: 0,
      queued: 0,
      skipped: 0,
      errors: [
        `Cannot read folder: ${err instanceof Error ? err.message : "access denied"}`,
      ],
    });
  }

  const dateFolders = entries.filter(
    (entry) => entry.isDirectory() && isDateFolderName(entry.name)
  );
  const otherDirs = entries
    .filter((entry) => entry.isDirectory() && !isDateFolderName(entry.name))
    .map((entry) => entry.name);
  const rootExcelFiles = entries.filter(
    (entry) =>
      entry.isFile() &&
      /\.xlsx?$/i.test(entry.name) &&
      !entry.name.toLowerCase().startsWith("~$")
  );

  if (dateFolders.length === 0) {
    let hint =
      "No date subfolders found (need DD.MM.YYYY, e.g. 09.07.2026). Set INVOICE_WATCH_DIR to the date folder directly, or create one.";
    if (otherDirs.length > 0) {
      hint += ` Subfolders here: ${otherDirs.slice(0, 5).join(", ")}.`;
    }
    if (rootExcelFiles.length > 0) {
      hint += ` Found ${rootExcelFiles.length} Excel file(s) in the main folder — move them into a date subfolder.`;
    }
    return finalizeScanResult(absoluteRoot, {
      scanned,
      queued,
      skipped,
      errors,
      hint,
      watching: absoluteRoot,
      dateFolders: [],
    });
  }

  for (const entry of dateFolders) {
    const folderIso = folderDateLabelToIso(entry.name);
    const folderPath = path.join(absoluteRoot, entry.name);
    await scanDirectory(folderPath, folderIso);
  }

  if (scanned === 0 && errors.length === 0) {
    return finalizeScanResult(absoluteRoot, {
      scanned,
      queued,
      skipped,
      errors,
      hint: `Found ${dateFolders.length} date folder(s) (${dateFolders
        .slice(0, 3)
        .map((e) => e.name)
        .join(", ")}) but no Excel files. Save .xlsx exports inside one of them.`,
      watching: absoluteRoot,
      dateFolders: dateFolders.map((e) => e.name),
    });
  }

  return finalizeScanResult(absoluteRoot, {
    scanned,
    queued,
    skipped,
    errors,
    watching: absoluteRoot,
    dateFolders: dateFolders.map((e) => e.name),
  });
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

export async function rejectedImportQueueCount(): Promise<number> {
  const db = await getDb();
  const rows = await dbAll(
    db
      .select({ id: invoiceImportQueue.id })
      .from(invoiceImportQueue)
      .where(eq(invoiceImportQueue.status, "rejected"))
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
