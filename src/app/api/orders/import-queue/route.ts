import { NextRequest, NextResponse } from "next/server";
import { requireApiSessionNoSalesWrite } from "@/lib/auth/api-guard";
import { isNetlify } from "@/lib/config/env";
import { getInvoiceWatchRoot } from "@/lib/services/app-settings";
import {
  listImportQueue,
  listInvoiceDateFolders,
  pendingImportQueueCount,
  rejectedImportQueueCount,
  dismissedImportQueueCount,
  resolveInvoiceScanPath,
  scanInvoiceWatchRoot,
} from "@/lib/services/invoice-import-queue";

export const runtime = "nodejs";

function cloudScanBlocked(watchRoot: string): string | null {
  if (!isNetlify()) return null;
  if (/^[A-Za-z]:[\\/]/.test(watchRoot)) {
    return "Folder scan runs on the HP PC where invoices are saved. Start npm run watch:invoices:turso there, then approve imports here.";
  }
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiSessionNoSalesWrite(request.method);
  if (!auth.ok) return auth.response;

  const statusParam = request.nextUrl.searchParams.get("status");
  const status =
    statusParam === "approved" ||
    statusParam === "rejected" ||
    statusParam === "dismissed" ||
    statusParam === "all"
      ? statusParam
      : "pending";

  const watchRoot = (await getInvoiceWatchRoot()) ?? "";
  const cloudBlock = watchRoot ? cloudScanBlocked(watchRoot) : null;
  const folderListing =
    watchRoot && !cloudBlock
      ? listInvoiceDateFolders(watchRoot)
      : { ok: false, folders: [] as string[], root: watchRoot, error: cloudBlock ?? undefined };

  const [items, pendingCount, rejectedCount, dismissedCount] = await Promise.all([
    listImportQueue(status),
    pendingImportQueueCount(),
    rejectedImportQueueCount(),
    dismissedImportQueueCount(),
  ]);

  return NextResponse.json({
    items,
    pendingCount,
    rejectedCount,
    dismissedCount,
    watchRoot,
    configured: Boolean(watchRoot),
    scanAvailable: Boolean(watchRoot && !cloudBlock),
    dateFolders: folderListing.folders,
    folderListError: folderListing.error,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSessionNoSalesWrite(request.method);
  if (!auth.ok) return auth.response;

  const baseRoot = (await getInvoiceWatchRoot()) ?? "";
  let watchRoot = baseRoot;
  let folderDate: string | undefined;

  try {
    const body = await request.json();
    if (typeof body.folderDate === "string" && body.folderDate.trim()) {
      folderDate = body.folderDate.trim();
    }
    if (typeof body.watchRoot === "string" && body.watchRoot.trim()) {
      watchRoot = body.watchRoot.trim();
    } else if (baseRoot && folderDate) {
      watchRoot = resolveInvoiceScanPath(baseRoot, folderDate);
    }
  } catch {
    // empty body scans the full watch root
  }

  if (!watchRoot) {
    return NextResponse.json(
      {
        error: "Invoice import folder is not configured.",
      },
      { status: 422 }
    );
  }

  const cloudBlock = cloudScanBlocked(watchRoot);
  if (cloudBlock) {
    return NextResponse.json(
      {
        error: cloudBlock,
        scanned: 0,
        queued: 0,
        skipped: 0,
        errors: [],
        hint: cloudBlock,
      },
      { status: 422 }
    );
  }

  const result = await scanInvoiceWatchRoot(watchRoot);
  const items = await listImportQueue("pending");

  return NextResponse.json({
    ...result,
    watchRoot,
    folderDate: folderDate ?? null,
    configured: true,
    pendingCount: items.length,
  });
}
