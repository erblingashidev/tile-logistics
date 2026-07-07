import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/api-guard";
import { getTruckWorkspaceSnapshot } from "@/lib/services/truck-workspace";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const vehicleId = Number(id);
  if (!Number.isFinite(vehicleId) || vehicleId <= 0) {
    return NextResponse.json({ error: "Invalid vehicle" }, { status: 400 });
  }

  try {
    return NextResponse.json(await getTruckWorkspaceSnapshot(vehicleId));
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load truck workspace";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
