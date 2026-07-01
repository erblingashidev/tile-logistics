import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  approveReportEditRequest,
  rejectReportEditRequest,
} from "@/lib/services/warehouse-reports";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const requestId = Number(id);
    if (!Number.isFinite(requestId)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const body = await request.json();
    const action = String(body.action ?? "");
    const adminNote = body.adminNote ? String(body.adminNote) : undefined;

    if (action === "approve") {
      const result = await approveReportEditRequest(requestId, adminNote);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result.report);
    }

    if (action === "reject") {
      const result = await rejectReportEditRequest(requestId, adminNote);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result.report);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
