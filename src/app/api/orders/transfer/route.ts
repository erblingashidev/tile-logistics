import { NextRequest, NextResponse } from "next/server";
import { requireApiSessionNoSalesWrite } from "@/lib/auth/api-guard";
import { transferOrdersToVehicle } from "@/lib/services/orders";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireApiSessionNoSalesWrite(request.method);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const orderIds = (body.orderIds as number[]) ?? [];
  const vehicleId = Number(body.vehicleId);
  const deliveryRound = Number(body.deliveryRound) || 1;
  const pickerId =
    body.pickerId != null && body.pickerId !== ""
      ? Number(body.pickerId)
      : null;
  const preservePicker = body.preservePicker !== false;
  const ignoreWeightWarning = Boolean(body.ignoreWeightWarning);
  const ignoreCraneRule = Boolean(body.ignoreCraneRule);
  const ignoreLinkedWarning = Boolean(body.ignoreLinkedWarning);

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
    pickerId,
    preservePicker: pickerId == null && preservePicker,
    ignoreWeightWarning,
    ignoreCraneRule,
    ignoreLinkedWarning,
  });

  if ("isLinkedWarning" in result && result.isLinkedWarning) {
    return NextResponse.json(result, { status: 422 });
  }

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
