import { NextRequest, NextResponse } from "next/server";
import { requireApiSessionNoSalesWrite } from "@/lib/auth/api-guard";
import {
  linkOrdersForSameDelivery,
  unlinkDeliveryGroup,
  unlinkOrdersInSelection,
} from "@/lib/services/order-delivery-links";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireApiSessionNoSalesWrite(request.method);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const orderIds = Array.isArray(body.orderIds)
    ? body.orderIds.map(Number).filter((id: number) => Number.isFinite(id) && id > 0)
    : [];
  const note = typeof body.note === "string" ? body.note : undefined;

  if (orderIds.length < 2) {
    return NextResponse.json(
      { error: "Select at least two orders to link" },
      { status: 400 }
    );
  }

  try {
    const result = await linkOrdersForSameDelivery(orderIds, note);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not link orders";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireApiSessionNoSalesWrite(request.method);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const orderId =
    body.orderId != null && body.orderId !== ""
      ? Number(body.orderId)
      : undefined;
  const orderIds = Array.isArray(body.orderIds)
    ? body.orderIds.map(Number).filter((id: number) => Number.isFinite(id) && id > 0)
    : [];

  try {
    if (orderId != null && Number.isFinite(orderId) && orderId > 0) {
      const result = await unlinkDeliveryGroup(orderId);
      return NextResponse.json(result);
    }

    if (orderIds.length < 1) {
      return NextResponse.json(
        { error: "Select a linked order or pass orderId to unlink" },
        { status: 400 }
      );
    }

    const result = await unlinkOrdersInSelection(orderIds);
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not unlink orders";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
