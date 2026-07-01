import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/api-guard";
import {
  listVehicles,
  createVehicle,
  type VehiclePayload,
} from "@/lib/services/vehicles";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  try {
    return NextResponse.json(await listVehicles());
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load vehicles";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as VehiclePayload;
  if (!body.name || !body.plateNumber) {
    return NextResponse.json(
      { error: "name and plateNumber are required" },
      { status: 400 }
    );
  }
  try {
    const vehicle = await createVehicle(body);
    return NextResponse.json(vehicle, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Plate number already exists" },
      { status: 409 }
    );
  }
}
