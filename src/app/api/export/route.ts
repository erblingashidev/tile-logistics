import { NextRequest, NextResponse } from "next/server";
import {
  buildOrdersExcel,
  buildLocationGroupedExcel,
  buildPartialDeliveriesExcel,
  buildDailyOperationsExcel,
} from "@/lib/export/excel";
import type { ExportGroupBy } from "@/lib/export/excel-format";
import { parseWorkDayFilter } from "@/lib/delivery-schedule";

export const runtime = "nodejs";

function parseGroupBy(raw: string | null): ExportGroupBy {
  const v = raw?.trim().toLowerCase();
  if (v === "region" || v === "truck" || v === "picker" || v === "driver") {
    return v;
  }
  return "none";
}

function parseExportFilters(sp: URLSearchParams) {
  const num = (key: string) => {
    const v = sp.get(key);
    return v ? Number(v) : undefined;
  };
  const workDay = sp.get("workDay");
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
    hideDelivered: sp.get("hideDelivered") === "true" ? true : undefined,
    vehicleId: num("vehicleId"),
    deliveryRound: num("deliveryRound"),
    vehicleScope:
      sp.get("vehicleScope") === "workspace" ||
      sp.get("vehicleScope") === "on_truck" ||
      sp.get("vehicleScope") === "unassigned"
        ? (sp.get("vehicleScope") as "workspace" | "on_truck" | "unassigned")
        : undefined,
    workDay: parseWorkDayFilter(workDay),
    shipAsOfDate: sp.get("shipAsOfDate") ?? undefined,
  };
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const type = sp.get("type") ?? "orders";
  const filters = parseExportFilters(sp);

  if (type === "partial-deliveries") {
    const buffer = await buildPartialDeliveriesExcel({
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      region: filters.region,
      search: filters.search,
      scope: sp.get("scope") === "all" ? "all" : "open",
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="partial-deliveries.xlsx"',
      },
    });
  }

  if (type === "daily") {
    const reportDate = sp.get("date") ?? undefined;
    const { buffer, filename } = await buildDailyOperationsExcel(reportDate);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const buffer =
    type === "locations"
      ? await buildLocationGroupedExcel()
      : await buildOrdersExcel(filters, {
          groupBy: parseGroupBy(sp.get("groupBy")),
        });

  const groupSuffix =
    type === "orders" && sp.get("groupBy") && sp.get("groupBy") !== "none"
      ? `-by-${sp.get("groupBy")}`
      : "";

  const filename =
    type === "locations"
      ? "orders-by-location.xlsx"
      : `orders-export${groupSuffix}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
