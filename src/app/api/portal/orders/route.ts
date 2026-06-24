import { NextResponse } from "next/server";
import { requireEmployee } from "@/lib/auth";
import { getEmployee } from "@/lib/services/employees";
import { getDriverTruckGroups } from "@/lib/services/load-coordination";
import { listOrdersForEmployee } from "@/lib/services/orders";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireEmployee();
    const profile = await getEmployee(session.employeeId);
    const orders = await listOrdersForEmployee(session.employeeId);
    const isDriver = session.roles.includes("driver");
    const truckGroups = isDriver
      ? await getDriverTruckGroups(session.employeeId)
      : [];

    return NextResponse.json(
      {
        orders,
        truckGroups,
        employee: {
          ...session,
          status: profile?.status ?? "available",
        },
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
