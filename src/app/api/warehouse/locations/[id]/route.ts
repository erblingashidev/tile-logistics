import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  deleteWarehouseLocation,
  getWarehouseLocation,
  listStockAtLocation,
  updateWarehouseLocation,
} from "@/lib/services/stock";

export const runtime = "nodejs";

function parseLocationId(id: string) {
  const locationId = Number(id);
  if (!Number.isFinite(locationId)) return null;
  return locationId;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const locationId = parseLocationId(id);
    if (locationId == null) {
      return NextResponse.json({ error: "Invalid location" }, { status: 400 });
    }

    const location = await getWarehouseLocation(locationId);
    if (!location) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const stock = await listStockAtLocation(locationId);
    return NextResponse.json({ location, stock });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const locationId = parseLocationId(id);
    if (locationId == null) {
      return NextResponse.json({ error: "Invalid location" }, { status: 400 });
    }

    const body = await request.json();
    const result = await updateWarehouseLocation(locationId, {
      code: body.code,
      zone: body.zone,
      label: body.label,
      notes: body.notes,
    });

    if (!result.ok) {
      const status = result.error === "Location not found" ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(result.location);
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const locationId = parseLocationId(id);
    if (locationId == null) {
      return NextResponse.json({ error: "Invalid location" }, { status: 400 });
    }

    const result = await deleteWarehouseLocation(locationId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
