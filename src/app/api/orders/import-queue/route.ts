import { NextRequest, NextResponse } from "next/server";
import { requireApiSessionNoSalesWrite } from "@/lib/auth/api-guard";
import {
  listImportQueue,
  pendingImportQueueCount,
  scanInvoiceWatchRoot,
} from "@/lib/services/invoice-import-queue";
import { getInvoiceWatchRoot } from "@/lib/services/app-settings";

export const runtime = "nodejs";

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
          "Invoice folder not configured. Open Settings and set the Faturat-Logistics path for this PC.",
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
