import { NextRequest, NextResponse } from "next/server";
import { requireEmployee } from "@/lib/auth";
import { WAREHOUSE_REPORT_ROLES } from "@/lib/employee-categories";
import { requestReportEdit } from "@/lib/services/warehouse-reports";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireEmployee();
    if (!session.roles.some((r) => WAREHOUSE_REPORT_ROLES.includes(r))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const reportId = Number(id);
    if (!Number.isFinite(reportId)) {
      return NextResponse.json({ error: "Invalid report" }, { status: 400 });
    }

    const body = await request.json();
    const result = await requestReportEdit({
      reportId,
      employeeId: session.employeeId,
      proposedBody: String(body.proposedBody ?? ""),
      reason: body.reason ? String(body.reason) : undefined,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
