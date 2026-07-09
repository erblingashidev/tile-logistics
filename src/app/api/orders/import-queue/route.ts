import { NextRequest, NextResponse } from "next/server";
import { requireApiSessionNoSalesWrite } from "@/lib/auth/api-guard";
import {
  listImportQueue,
  pendingImportQueueCount,
  scanInvoiceWatchRoot,
} from "@/lib/services/invoice-import-queue";
import { getInvoiceWatchRoot } from "@/lib/services/app-settings";
import { isNetlify } from "@/lib/config/env";

export const runtime = "nodejs";

function cloudScanBlocked(watchRoot: string): string | null {
  if (!isNetlify()) return null;
  if (/^[A-Za-z]:[\\/]/.test(watchRoot)) {
    return "Folder scan cannot run from the cloud site — run on the HP PC: npm run watch:invoices:turso";
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
    statusParam === "all"
      ? statusParam
      : "pending";

  const watchRoot = (await getInvoiceWatchRoot()) ?? "";

  const [items, pendingCount] = await Promise.all([
    listImportQueue(status),
    pendingImportQueueCount(),
  ]);

  return NextResponse.json({
    items,
    pendingCount,
    watchRoot,
    configured: Boolean(watchRoot),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSessionNoSalesWrite(request.method);
  if (!auth.ok) return auth.response;

  let watchRoot = (await getInvoiceWatchRoot()) ?? "";
  try {
    const body = await request.json();
    if (typeof body.watchRoot === "string" && body.watchRoot.trim()) {
      watchRoot = body.watchRoot.trim();
    }
  } catch {
    // empty body is fine
  }

  if (!watchRoot) {
    return NextResponse.json(
      {
        error:
          "Invoice folder not configured. On the HP PC set INVOICE_WATCH_DIR in .env.local and run npm run watch:invoices:turso.",
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
    configured: true,
    pendingCount: items.length,
  });
}
