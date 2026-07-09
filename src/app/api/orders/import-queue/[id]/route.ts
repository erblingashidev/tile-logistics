import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/auth/api-guard";
import {
  approveImportQueueItem,
  rejectImportQueueItem,
} from "@/lib/services/invoice-import-queue";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await request.json();
  const action = body.action as string;

  if (action === "approve") {
    const result = await approveImportQueueItem(id, {
      merge: body.merge === true,
      invoiceNumberOverride:
        typeof body.invoiceNumberOverride === "string"
          ? body.invoiceNumberOverride
          : undefined,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 422 }
      );
    }
    return NextResponse.json(result);
  }

  if (action === "reject") {
    const result = await rejectImportQueueItem(
      id,
      typeof body.adminNote === "string" ? body.adminNote : undefined
    );
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 422 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
