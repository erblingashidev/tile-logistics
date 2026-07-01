import { NextRequest, NextResponse } from "next/server";
import { requireApiSessionNoSalesWrite } from "@/lib/auth/api-guard";
import { assignOrderToVehicle, unassignOrder } from "@/lib/services/orders";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSessionNoSalesWrite(request.method);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json();
  const vehicleId = Number(body.vehicleId);
  const deliveryRound = Number(body.deliveryRound) || 1;
  const ignoreWeightWarning = Boolean(body.ignoreWeightWarning);
  const ignoreCraneRule = Boolean(body.ignoreCraneRule);

  if (!vehicleId) {
    return NextResponse.json({ error: "vehicleId is required" }, { status: 400 });
  }

  const result = await assignOrderToVehicle(
    Number(id),
    vehicleId,
    deliveryRound,
    ignoreWeightWarning,
    ignoreCraneRule
  );

  if (!result.ok) {
    const status = "isWeightWarning" in result && result.isWeightWarning ? 422 : 409;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSessionNoSalesWrite(request.method);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const sp = request.nextUrl.searchParams;
  const round = sp.get("round") ? Number(sp.get("round")) : undefined;
  const order = await unassignOrder(Number(id), round);
  return NextResponse.json(order);
}
