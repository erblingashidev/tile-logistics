import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/auth/api-guard";
import { bulkRescheduleOrders } from "@/lib/services/orders";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as {
    orderIds?: number[];
    requestedDeliveryDate?: string;
  };

  const orderIds = Array.isArray(body.orderIds)
    ? body.orderIds.filter((id) => Number.isFinite(id))
    : [];
  if (orderIds.length === 0) {
    return NextResponse.json({ error: "Select at least one order" }, { status: 400 });
  }

  const result = await bulkRescheduleOrders({
    orderIds,
    requestedDeliveryDate: String(body.requestedDeliveryDate ?? "").trim(),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
