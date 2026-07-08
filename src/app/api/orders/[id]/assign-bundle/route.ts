import { NextRequest, NextResponse } from "next/server";
import { requireApiSessionNoSalesWrite } from "@/lib/auth/api-guard";
import { assignOrderBundle } from "@/lib/services/orders";

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
  const pickerId = body.pickerId ? Number(body.pickerId) : null;
  const autoAssignTeam = body.autoAssignTeam !== false;
  const ignoreWeightWarning = Boolean(body.ignoreWeightWarning);
  const ignoreCraneRule = Boolean(body.ignoreCraneRule);
  const ignoreLinkedWarning = Boolean(body.ignoreLinkedWarning);

  if (!vehicleId) {
    return NextResponse.json({ error: "vehicleId is required" }, { status: 400 });
  }

  const result = await assignOrderBundle({
    orderId: Number(id),
    vehicleId,
    deliveryRound,
    pickerId,
    autoAssignTeam,
    ignoreWeightWarning,
    ignoreCraneRule,
    ignoreLinkedWarning,
  });

  if (!result.ok) {
    const status =
      "isWeightWarning" in result && result.isWeightWarning
        ? 422
        : "isLinkedWarning" in result && result.isLinkedWarning
          ? 422
          : 409;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}
