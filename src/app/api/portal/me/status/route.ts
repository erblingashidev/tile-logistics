import { NextRequest, NextResponse } from "next/server";
import { requireEmployee } from "@/lib/auth";
import { updateEmployeeStatusSelf } from "@/lib/services/employees";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireEmployee();
    const body = await request.json();
    const status = String(body.status ?? "");
    const result = await updateEmployeeStatusSelf(session.employeeId, status);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
