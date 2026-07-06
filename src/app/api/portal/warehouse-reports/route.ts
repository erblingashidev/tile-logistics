import { NextRequest, NextResponse } from "next/server";
import { requireEmployee } from "@/lib/auth";
import { WAREHOUSE_REPORT_ROLES } from "@/lib/employee-categories";
import {
  getWarehouseReportPortalContext,
  submitWarehouseReport,
} from "@/lib/services/warehouse-reports";
import type { WarehouseReportType } from "@/lib/constants";

export const runtime = "nodejs";

function apiError(error: unknown, fallback: string, status = 500) {
  console.error("[warehouse-reports]", error);
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    const session = await requireEmployee();
    if (!session.roles.some((r) => WAREHOUSE_REPORT_ROLES.includes(r))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const context = await getWarehouseReportPortalContext(session.employeeId);
    if (!context) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(context);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return apiError(error, "Could not load warehouse reports.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireEmployee();
    if (!session.roles.some((r) => WAREHOUSE_REPORT_ROLES.includes(r))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const form = await request.formData();
    const reportType = String(form.get("reportType") ?? "") as WarehouseReportType;
    const category = String(form.get("category") ?? "");
    const body = String(form.get("body") ?? "");
    const zone = form.get("zone") ? String(form.get("zone")) : null;
    const reportWeek = form.get("reportWeek") ? String(form.get("reportWeek")) : null;

    const taggedLeaderIds = form
      .getAll("taggedLeaderIds")
      .map((value) => Number(value))
      .filter((id) => Number.isFinite(id));

    const photos: Array<{ buffer: Buffer; mimeType: string }> = [];
    for (const entry of form.getAll("photos")) {
      if (entry instanceof File && entry.size > 0) {
        photos.push({
          buffer: Buffer.from(await entry.arrayBuffer()),
          mimeType: entry.type || "image/jpeg",
        });
      }
    }

    const photo = form.get("photo");
    if (photo instanceof File && photo.size > 0) {
      photos.push({
        buffer: Buffer.from(await photo.arrayBuffer()),
        mimeType: photo.type || "image/jpeg",
      });
    }

    const result = await submitWarehouseReport({
      employeeId: session.employeeId,
      employeeRoles: session.roles,
      reportType,
      category,
      body,
      zone,
      taggedLeaderIds,
      reportWeek,
      photos,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return apiError(error, "Could not submit warehouse report.");
  }
}
