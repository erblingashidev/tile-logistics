import { NextRequest, NextResponse } from "next/server";
import {
  generateDispatchPlan,
  generateFullDayDispatchPlan,
  recommendOrderAssignment,
} from "@/lib/dispatch/recommendations";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const orderId = sp.get("orderId") ? Number(sp.get("orderId")) : undefined;
  const deliveryRound = sp.get("deliveryRound")
    ? Number(sp.get("deliveryRound"))
    : 1;

  if (orderId) {
    const result = await recommendOrderAssignment(orderId, deliveryRound);
    if (!result.ok) {
      return NextResponse.json(result, { status: 404 });
    }
    return NextResponse.json(result);
  }

  if (sp.get("allRounds") === "true") {
    const plan = await generateFullDayDispatchPlan({
      region: sp.get("region") ?? undefined,
      maxOrdersPerRoute: sp.get("maxOrders")
        ? Number(sp.get("maxOrders"))
        : undefined,
      maxDistanceKm: sp.get("maxDistanceKm")
        ? Number(sp.get("maxDistanceKm"))
        : undefined,
      maxRounds: sp.get("maxRounds") ? Number(sp.get("maxRounds")) : undefined,
    });
    return NextResponse.json(plan);
  }

  const plan = await generateDispatchPlan({
    deliveryRound,
    region: sp.get("region") ?? undefined,
    city: sp.get("city") ?? undefined,
    maxOrdersPerRoute: sp.get("maxOrders")
      ? Number(sp.get("maxOrders"))
      : undefined,
    maxDistanceKm: sp.get("maxDistanceKm")
      ? Number(sp.get("maxDistanceKm"))
      : undefined,
  });

  return NextResponse.json(plan);
}
