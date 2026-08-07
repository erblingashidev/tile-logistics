import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/constants";
import { updateOrderStatus } from "@/lib/services/order-status";
import { updateOrderStatusWithAttribution } from "@/lib/services/orders";

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
    const status = String(body.status ?? "") as OrderStatus;
    if (!ORDER_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const vehicleId = parseOptionalId(body.vehicleId);
    const pickerId = parseOptionalId(body.pickerId);
    const deliveryRoundRaw = body.deliveryRound;
    const deliveryRound =
      deliveryRoundRaw != null && deliveryRoundRaw !== ""
        ? Number(deliveryRoundRaw)
        : undefined;
    if (
      deliveryRound != null &&
      (!Number.isFinite(deliveryRound) || deliveryRound < 1)
    ) {
      return NextResponse.json({ error: "Invalid delivery round" }, { status: 400 });
    }

    const hasAttribution = vehicleId != null || pickerId != null;

    if (hasAttribution) {
      const result = await updateOrderStatusWithAttribution({
        orderId,
        status,
        vehicleId,
        deliveryRound,
        pickerId,
      });
      if (!result.ok) {
        return NextResponse.json(
          { error: "error" in result ? result.error : "Update failed" },
          { status: 400 }
        );
      }
      return NextResponse.json(result);
    }

    const result = await updateOrderStatus(orderId, status);
    if (!result) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
