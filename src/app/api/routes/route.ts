import { NextRequest, NextResponse } from "next/server";
import {
  assignRouteToVehicle,
  getRoutePlans,
} from "@/lib/services/orders";
import { getVehicle } from "@/lib/services/vehicles";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const vehicleId = sp.get("vehicleId")
    ? Number(sp.get("vehicleId"))
    : undefined;
  const deliveryRound = sp.get("deliveryRound")
    ? Number(sp.get("deliveryRound"))
    : 1;

  let vehicleMaxPallets: number | undefined;
  let vehicleMaxWeightKg: number | undefined;

  if (vehicleId) {
    const v = await getVehicle(vehicleId);
    if (v) {
      vehicleMaxPallets = v.maxPallets;
      vehicleMaxWeightKg = v.maxWeightKg;
    }
  }

  const plans = await getRoutePlans({
    region: sp.get("region") ?? undefined,
    city: sp.get("city") ?? undefined,
    employeeId: sp.get("employeeId") ? Number(sp.get("employeeId")) : undefined,
    pickerId: sp.get("pickerId") ? Number(sp.get("pickerId")) : undefined,
    driverId: sp.get("driverId") ? Number(sp.get("driverId")) : undefined,
    unassignedOnly: sp.get("unassigned") !== "false",
    maxOrdersPerRoute: sp.get("maxOrders")
      ? Number(sp.get("maxOrders"))
      : 3,
    maxDistanceKm: sp.get("maxDistanceKm")
      ? Number(sp.get("maxDistanceKm"))
      : 20,
    vehicleId,
    vehicleMaxPallets,
    vehicleMaxWeightKg,
    deliveryRound,
  });

  return NextResponse.json(plans);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const orderIds = (body.orderIds as number[]) ?? [];
  const vehicleId = Number(body.vehicleId);
  const deliveryRound = Number(body.deliveryRound) || 1;
  const ignoreWeightWarning = Boolean(body.ignoreWeightWarning);
  const ignoreCraneRule = Boolean(body.ignoreCraneRule);

  if (!vehicleId || orderIds.length === 0) {
    return NextResponse.json(
      { error: "vehicleId and orderIds required" },
      { status: 400 }
    );
  }

  const results = await assignRouteToVehicle(
    orderIds,
    vehicleId,
    deliveryRound,
    ignoreWeightWarning,
    ignoreCraneRule
  );

  const failed = results.find((r) => !r.ok);
  if (failed) {
    const status = failed.requiresCrane ? 409 : 409;
    return NextResponse.json({ results }, { status });
  }

  return NextResponse.json({ results });
}
