import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  deleteMaintenanceRecord,
  updateMaintenanceRecord,
} from "@/lib/services/vehicle-maintenance";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const recordId = Number(id);
    if (!Number.isFinite(recordId)) {
      return NextResponse.json({ error: "Invalid record" }, { status: 400 });
    }

    const body = await request.json();
    const result = await updateMaintenanceRecord(recordId, {
      vehicleId: body.vehicleId != null ? Number(body.vehicleId) : undefined,
      performedAt: body.performedAt ? String(body.performedAt) : undefined,
      nextDueAt:
        body.nextDueAt !== undefined
          ? body.nextDueAt
            ? String(body.nextDueAt)
            : null
          : undefined,
      workDone: body.workDone ? String(body.workDone) : undefined,
      cost: body.cost != null ? Number(body.cost) : undefined,
      notes: body.notes !== undefined ? String(body.notes) : undefined,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result.record);
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
    const recordId = Number(id);
    if (!Number.isFinite(recordId)) {
      return NextResponse.json({ error: "Invalid record" }, { status: 400 });
    }

    const result = await deleteMaintenanceRecord(recordId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
