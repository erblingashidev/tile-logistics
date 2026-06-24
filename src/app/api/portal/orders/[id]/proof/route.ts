import { NextRequest, NextResponse } from "next/server";
import { requireEmployee } from "@/lib/auth";
import { submitDeliveryProof } from "@/lib/services/delivery-proofs";
import type { DeliveryProofPhase } from "@/lib/constants";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireEmployee();
    const { id } = await params;
    const orderId = Number(id);
    const form = await request.formData();

    const phase = String(form.get("phase") ?? "") as DeliveryProofPhase;
    const notes = form.get("notes") ? String(form.get("notes")) : undefined;
    const latRaw = form.get("lat");
    const lngRaw = form.get("lng");
    const lat = latRaw ? Number(latRaw) : undefined;
    const lng = lngRaw ? Number(lngRaw) : undefined;

    const photo = form.get("photo");
    let photoBuffer: Buffer | undefined;
    let photoMime: string | undefined;
    if (photo instanceof File && photo.size > 0) {
      photoBuffer = Buffer.from(await photo.arrayBuffer());
      photoMime = photo.type || "image/jpeg";
    }

    const result = await submitDeliveryProof({
      orderId,
      employeeId: session.employeeId,
      employeeRoles: session.roles,
      phase,
      photoBuffer,
      photoMime,
      notes,
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
