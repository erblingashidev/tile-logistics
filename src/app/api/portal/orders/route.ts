import { NextResponse } from "next/server";
import { requireEmployee } from "@/lib/auth";
import { getEmployee } from "@/lib/services/employees";
import { getDriverTruckGroups } from "@/lib/services/load-coordination";
import { listOrdersForEmployee } from "@/lib/services/orders";
import { listUnreadNotifications } from "@/lib/services/employee-notifications";
import { getDb } from "@/lib/db";
import { dbOne } from "@/lib/db/query";
import { vehicles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireEmployee();
    const profile = await getEmployee(session.employeeId);
    const orders = await listOrdersForEmployee(session.employeeId, {
      roles: session.roles,
    });
    const isDriver = session.roles.includes("driver");
    const truckGroups = isDriver
      ? await getDriverTruckGroups(session.employeeId)
      : [];

    let vehicleStatus: string | null = null;
    if (profile?.assignedVehicleId) {
      const db = await getDb();
      const vehicle = await dbOne(
        db
          .select({ status: vehicles.status })
          .from(vehicles)
          .where(eq(vehicles.id, profile.assignedVehicleId))
      );
      vehicleStatus = vehicle?.status ?? null;
    }

    let notifications: Awaited<ReturnType<typeof listUnreadNotifications>> = [];
    try {
      notifications = await listUnreadNotifications(session.employeeId);
    } catch (err) {
      console.error("[api/portal/orders GET] notifications failed", err);
    }

    return NextResponse.json(
      {
        orders,
        truckGroups,
        notifications,
        employee: {
          ...session,
          status: profile?.status ?? "available",
          vehicleStatus,
        },
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error("[api/portal/orders GET]", err);
    return NextResponse.json(
      { error: "Failed to load portal data" },
      { status: 500 }
    );
  }
}
