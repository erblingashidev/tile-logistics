import { NextResponse } from "next/server";
import { requireEmployee } from "@/lib/auth";
import { confirmTruckArrivedAtWarehouse } from "@/lib/services/truck-workspace";

export const runtime = "nodejs";

export async function POST() {
  try {
    const session = await requireEmployee();
    if (!session.roles.includes("driver")) {
      return NextResponse.json({ error: "Drivers only" }, { status: 403 });
    }

    const result = await confirmTruckArrivedAtWarehouse(session.employeeId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
