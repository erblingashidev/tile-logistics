import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  createMaintenanceRecord,
  getMaintenanceDashboardStats,
  listMaintenanceRecords,
  listVehicleMaintenanceOverview,
} from "@/lib/services/vehicle-maintenance";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const vehicleIdRaw = request.nextUrl.searchParams.get("vehicleId");
    const vehicleId = vehicleIdRaw ? Number(vehicleIdRaw) : undefined;
    const view = request.nextUrl.searchParams.get("view");

    if (view === "overview") {
      const [overview, stats] = await Promise.all([
        listVehicleMaintenanceOverview(),
        getMaintenanceDashboardStats(),
      ]);
      return NextResponse.json({ overview, stats });
    }

    return NextResponse.json(
      await listMaintenanceRecords(
        vehicleId != null && Number.isFinite(vehicleId) ? vehicleId : undefined
      )
    );
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json();
    const result = await createMaintenanceRecord({
      vehicleId: Number(body.vehicleId),
      performedAt: String(body.performedAt ?? ""),
      nextDueAt: body.nextDueAt ? String(body.nextDueAt) : null,
      workDone: String(body.workDone ?? ""),
      cost: Number(body.cost ?? 0),
      notes: body.notes ? String(body.notes) : null,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result.record, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
