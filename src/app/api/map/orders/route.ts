import { NextRequest, NextResponse } from "next/server";
import { requireApiSessionNoSalesWrite } from "@/lib/auth/api-guard";
import { parseWorkDayFilter } from "@/lib/delivery-schedule";
import { listOrders } from "@/lib/services/orders";
import { buildOrderMapPins } from "@/lib/locations/map-pins";
import { WAREHOUSE_LOCATION } from "@/lib/locations";

export const runtime = "nodejs";

function parseWorkDay(value: string | null) {
  return parseWorkDayFilter(value);
}

export async function GET(request: NextRequest) {
  const auth = await requireApiSessionNoSalesWrite(request.method);
  if (!auth.ok) return auth.response;

  const sp = request.nextUrl.searchParams;
  const region = sp.get("region") ?? undefined;
  const unassignedOnly = sp.get("unassigned") === "true";
  const workDay = parseWorkDay(sp.get("workDay"));

  const orders = await listOrders({
    region,
    unassigned: unassignedOnly || undefined,
    workDay,
    shipAsOfDate: sp.get("shipAsOfDate") ?? undefined,
  });

  const activeOrders = orders.filter(
    (o) => o.status !== "delivered" && o.status !== "cancelled"
  );

  const pins = buildOrderMapPins(
    activeOrders.map((o) => ({
      id: o.id,
      invoiceNumber: o.invoiceNumber,
      customerName: o.customerName,
      location: o.location,
      city: o.city,
      region: o.region,
      lat: o.lat,
      lng: o.lng,
      locationId: o.locationId,
      status: o.status,
      requestedDeliveryDate: o.requestedDeliveryDate,
    }))
  );

  return NextResponse.json({
    warehouse: WAREHOUSE_LOCATION,
    pins,
    orderCount: activeOrders.length,
    pinCount: pins.length,
    streetPins: pins.filter((p) => p.precision === "street").length,
    cityPins: pins.filter((p) => p.precision === "city").length,
  });
}
