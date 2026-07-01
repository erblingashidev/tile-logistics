import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  deleteWarehouseReport,
  updateWarehouseReportAdmin,
} from "@/lib/services/warehouse-reports";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const reportId = Number(id);
    if (!Number.isFinite(reportId)) {
      return NextResponse.json({ error: "Invalid report" }, { status: 400 });
    }

    const contentType = request.headers.get("content-type") ?? "";
    let body: string | undefined;
    let category: string | undefined;
    const photos: Array<{ buffer: Buffer; mimeType: string }> = [];

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      if (form.get("body")) body = String(form.get("body"));
      if (form.get("category")) category = String(form.get("category"));
      for (const entry of form.getAll("photos")) {
        if (entry instanceof File && entry.size > 0) {
          photos.push({
            buffer: Buffer.from(await entry.arrayBuffer()),
            mimeType: entry.type || "image/jpeg",
          });
        }
      }
    } else {
      const json = await request.json();
      body = json.body;
      category = json.category;
    }

    const result = await updateWarehouseReportAdmin(reportId, {
      body,
      category,
      photos: photos.length > 0 ? photos : undefined,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json(result.report);
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const reportId = Number(id);
    if (!Number.isFinite(reportId)) {
      return NextResponse.json({ error: "Invalid report" }, { status: 400 });
    }

    const result = await deleteWarehouseReport(reportId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
