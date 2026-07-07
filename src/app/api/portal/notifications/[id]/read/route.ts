import { NextRequest, NextResponse } from "next/server";
import { requireEmployee } from "@/lib/auth";
import { markNotificationRead } from "@/lib/services/employee-notifications";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireEmployee();
    const { id } = await context.params;
    const notificationId = Number(id);
    if (!Number.isFinite(notificationId)) {
      return NextResponse.json({ error: "Invalid notification" }, { status: 400 });
    }

    const result = await markNotificationRead(notificationId, session.employeeId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
