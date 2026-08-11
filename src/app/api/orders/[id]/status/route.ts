import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { MANUAL_ORDER_STATUSES, type ManualOrderStatus } from "@/lib/constants";
import { updateManualOrderStatus } from "@/lib/services/manual-order-status";

export const runtime = "nodejs";

function parseOptionalId(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const orderId = Number(id);
    if (!Number.isFinite(orderId) || orderId <= 0) {
      return NextResponse.json({ error: "Invalid order" }, { status: 400 });
    }

    const body = await request.json();
    const status = String(body.status ?? "") as ManualOrderStatus;
    if (!MANUAL_ORDER_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const applyToLinked =
      body.applyToLinked === false || body.applyToLinked === "false"
        ? false
        : true;

    const result = await updateManualOrderStatus({
      orderId,
      status,
      applyToLinked,
      vehicleId: parseOptionalId(body.vehicleId),
      pickerId: parseOptionalId(body.pickerId),
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: "error" in result ? result.error : "Update failed" },
        { status: 400 }
      );
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
