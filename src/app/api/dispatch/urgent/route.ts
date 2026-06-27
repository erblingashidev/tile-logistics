import { NextRequest, NextResponse } from "next/server";
import { recommendUrgentPlacement } from "@/lib/dispatch/urgent-routing";
import { assignOrderBundle } from "@/lib/services/orders";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const orderId = Number(request.nextUrl.searchParams.get("orderId"));
  if (!orderId) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }
  const result = await recommendUrgentPlacement(orderId);
  if (!result.ok) {
    return NextResponse.json(result, { status: 404 });
  }
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const orderId = Number(body.orderId);
  const vehicleId = Number(body.vehicleId);
  const deliveryRound = Number(body.deliveryRound) || 1;

  if (!orderId || !vehicleId) {
    return NextResponse.json(
      { error: "orderId and vehicleId required" },
      { status: 400 }
    );
  }

  let pickerId =
    body.pickerId != null && body.pickerId !== ""
      ? Number(body.pickerId)
      : null;

  if (!pickerId) {
    const placement = await recommendUrgentPlacement(orderId);
    if (placement.ok) {
      const match = placement.options.find(
        (o) => o.vehicleId === vehicleId && o.deliveryRound === deliveryRound
      );
      if (match?.pickerId) pickerId = match.pickerId;
    }
  }

  const result = await assignOrderBundle({
    orderId,
    vehicleId,
    deliveryRound,
    pickerId,
    autoAssignTeam: true,
    ignoreWeightWarning: Boolean(body.ignoreWeightWarning),
    ignoreCraneRule: Boolean(body.ignoreCraneRule),
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 409 });
  }
  return NextResponse.json({ ok: true, order: result.order });
}
