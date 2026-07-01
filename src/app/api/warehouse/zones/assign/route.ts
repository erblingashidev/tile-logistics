import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { assignGroupLeaderZones } from "@/lib/services/warehouse-reports";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json();
    const employeeId = Number(body.employeeId);
    if (!Number.isFinite(employeeId)) {
      return NextResponse.json({ error: "Select an employee" }, { status: 400 });
    }

    const result = await assignGroupLeaderZones({
      employeeId,
      zones: Array.isArray(body.zones) ? body.zones : [],
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
