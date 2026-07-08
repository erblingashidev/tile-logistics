import { NextRequest, NextResponse } from "next/server";
import { requireApiSession, requireApiSessionNoSalesWrite } from "@/lib/auth/api-guard";
import {
  listOrders,
  createOrder,
  type OrderPayload,
} from "@/lib/services/orders";
import { resolveSalesOwnership } from "@/lib/services/sales-portal";
import { todayDateString } from "@/lib/delivery-schedule";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  try {
    const sp = request.nextUrl.searchParams;
    const orders = await listOrders({
      dateFrom: sp.get("dateFrom") ?? undefined,
      dateTo: sp.get("dateTo") ?? undefined,
      minM2: sp.get("minM2") ? Number(sp.get("minM2")) : undefined,
      maxM2: sp.get("maxM2") ? Number(sp.get("maxM2")) : undefined,
      minPallets: sp.get("minPallets")
        ? Number(sp.get("minPallets"))
        : undefined,
      maxPallets: sp.get("maxPallets")
        ? Number(sp.get("maxPallets"))
        : undefined,
      minPrice: sp.get("minPrice") ? Number(sp.get("minPrice")) : undefined,
      maxPrice: sp.get("maxPrice") ? Number(sp.get("maxPrice")) : undefined,
      location: sp.get("location") ?? undefined,
      city: sp.get("city") ?? undefined,
      region: sp.get("region") ?? undefined,
      employeeId: sp.get("employeeId") ? Number(sp.get("employeeId")) : undefined,
      pickerId: sp.get("pickerId") ? Number(sp.get("pickerId")) : undefined,
      driverId: sp.get("driverId") ? Number(sp.get("driverId")) : undefined,
      vehicleId: sp.get("vehicleId") ? Number(sp.get("vehicleId")) : undefined,
      deliveryRound: sp.get("deliveryRound")
        ? Number(sp.get("deliveryRound"))
        : undefined,
      fleetRoundFilter: sp.get("fleetRoundFilter") === "true",
      vehicleScope:
        sp.get("vehicleScope") === "on_truck" ||
        sp.get("vehicleScope") === "unassigned" ||
        sp.get("vehicleScope") === "workspace"
          ? (sp.get("vehicleScope") as "workspace" | "on_truck" | "unassigned")
          : undefined,
      unassigned: sp.get("unassigned") === "true",
      status: sp.get("status") ?? undefined,
      search: sp.get("search") ?? undefined,
      hideDelivered: sp.get("hideDelivered") === "true",
      workDay:
        sp.get("workDay") === "today" ||
        sp.get("workDay") === "yesterday" ||
        sp.get("workDay") === "overdue" ||
        sp.get("workDay") === "all"
          ? (sp.get("workDay") as "today" | "yesterday" | "overdue" | "all")
          : undefined,
      shipAsOfDate: sp.get("shipAsOfDate") ?? undefined,
    });
    return NextResponse.json(orders, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err) {
    console.error("[api/orders GET]", err);
    const message =
      err instanceof Error ? err.message : "Failed to load orders";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSessionNoSalesWrite(request.method);
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as OrderPayload;
  if (!body.invoiceNumber || !body.customerName) {
    return NextResponse.json(
      { error: "invoiceNumber and customerName are required" },
      { status: 400 }
    );
  }
  if (!body.region && !body.location?.trim()) {
    return NextResponse.json(
      { error: "Select a region or enter delivery details" },
      { status: 400 }
    );
  }
  try {
    const ownership = await resolveSalesOwnership({
      salesAgentName: body.salesAgentName,
      salesEmployeeId: body.salesEmployeeId,
    });
    const order = await createOrder({
      ...body,
      location: body.location?.trim() || body.region || "—",
      orderDate: body.orderDate?.trim() || todayDateString(),
      items: body.items ?? [],
      salesEmployeeId: ownership.salesEmployeeId,
      salesAgentName: ownership.salesAgentName,
    });
    return NextResponse.json(order, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create order";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
