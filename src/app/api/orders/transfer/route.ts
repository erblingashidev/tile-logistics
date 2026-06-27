import { NextRequest, NextResponse } from "next/server";
import { transferOrdersToVehicle } from "@/lib/services/orders";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const orderIds = (body.orderIds as number[]) ?? [];
  const vehicleId = Number(body.vehicleId);
  const deliveryRound = Number(body.deliveryRound) || 1;
  const preservePicker = body.preservePicker !== false;
  const ignoreWeightWarning = Boolean(body.ignoreWeightWarning);
  const ignoreCraneRule = Boolean(body.ignoreCraneRule);

  if (!vehicleId || orderIds.length === 0) {
    return NextResponse.json(
      { error: "vehicleId and orderIds are required" },
      { status: 400 }
    );
  }

  const result = await transferOrdersToVehicle({
    orderIds,
    vehicleId,
    deliveryRound,
    preservePicker,
    ignoreWeightWarning,
    ignoreCraneRule,
  });

  const weightWarn = result.results.find((r) => r.isWeightWarning);
  if (weightWarn) {
    return NextResponse.json(result, { status: 422 });
  }

  const craneBlock = result.results.find((r) => r.requiresCrane);
  if (craneBlock) {
    return NextResponse.json(result, { status: 409 });
  }

  if (!result.ok) {
    return NextResponse.json(result, { status: 409 });
  }

  return NextResponse.json(result);
}
