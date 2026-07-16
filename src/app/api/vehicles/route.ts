import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/api-guard";
import {
  listVehicles,
  createVehicle,
  type VehiclePayload,
  type VehicleCategory,
} from "@/lib/services/vehicles";

export const runtime = "nodejs";

function parseListOptions(searchParams: URLSearchParams) {
  const forParam = searchParams.get("for");
  if (forParam === "transport" || forParam === "delivery") {
    return { forTransport: true as const };
  }
  const category = searchParams.get("category");
  if (category === "delivery" || category === "sales") {
    return { category: category as VehicleCategory };
  }
  return undefined;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  try {
    const options = parseListOptions(request.nextUrl.searchParams);
    return NextResponse.json(await listVehicles(options));
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
