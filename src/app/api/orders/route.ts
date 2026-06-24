import { NextRequest, NextResponse } from "next/server";
import {
  listOrders,
  createOrder,
  type OrderPayload,
} from "@/lib/services/orders";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
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
    unassigned: sp.get("unassigned") === "true",
    status: sp.get("status") ?? undefined,
    search: sp.get("search") ?? undefined,
    hideDelivered: sp.get("hideDelivered") === "true",
  });
  return NextResponse.json(orders, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

export async function POST(request: NextRequest) {
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
    const order = await createOrder({
      ...body,
      location: body.location?.trim() || body.region || "—",
      orderDate: body.orderDate ?? new Date().toISOString().slice(0, 10),
      items: body.items ?? [],
    });
    return NextResponse.json(order, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create order";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
