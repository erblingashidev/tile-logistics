import { NextRequest, NextResponse } from "next/server";
import {
  buildOrdersExcel,
  buildLocationGroupedExcel,
} from "@/lib/export/excel";

export const runtime = "nodejs";

function parseExportFilters(sp: URLSearchParams) {
  const num = (key: string) => {
    const v = sp.get(key);
    return v ? Number(v) : undefined;
  };
  return {
    dateFrom: sp.get("dateFrom") ?? undefined,
    dateTo: sp.get("dateTo") ?? undefined,
    minM2: num("minM2"),
    maxM2: num("maxM2"),
    minPallets: num("minPallets"),
    maxPallets: num("maxPallets"),
    minPrice: num("minPrice"),
    maxPrice: num("maxPrice"),
    location: sp.get("location") ?? undefined,
    city: sp.get("city") ?? undefined,
    region: sp.get("region") ?? undefined,
    employeeId: num("employeeId"),
    pickerId: num("pickerId"),
    driverId: num("driverId"),
    status: sp.get("status") ?? undefined,
    search: sp.get("search") ?? undefined,
    unassigned: sp.get("unassigned") === "true" ? true : undefined,
  };
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const type = sp.get("type") ?? "orders";
  const filters = parseExportFilters(sp);

  const buffer =
    type === "locations"
      ? await buildLocationGroupedExcel()
      : await buildOrdersExcel(filters);

  const filename =
    type === "locations"
      ? "orders-by-location.xlsx"
      : "orders-export.xlsx";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
