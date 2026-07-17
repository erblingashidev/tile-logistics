import { NextRequest, NextResponse } from "next/server";
import { requireEmployee } from "@/lib/auth";
import { submitDeliveryProof } from "@/lib/services/delivery-proofs";
import type { DeliveryProofPhase } from "@/lib/constants";

export const runtime = "nodejs";

function authErrorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : "Unauthorized";
  if (message === "Forbidden") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let session;
  try {
    session = await requireEmployee();
  } catch (err) {
    return authErrorResponse(err);
  }

  try {
    const { id } = await params;
    const orderId = Number(id);
    if (!Number.isFinite(orderId) || orderId <= 0) {
      return NextResponse.json({ error: "Invalid order" }, { status: 400 });
    }

    const form = await request.formData();

    const phase = String(form.get("phase") ?? "") as DeliveryProofPhase;
    const notes = form.get("notes") ? String(form.get("notes")) : undefined;
    const latRaw = form.get("lat");
    const lngRaw = form.get("lng");
    const lat = latRaw ? Number(latRaw) : undefined;
    const lng = lngRaw ? Number(lngRaw) : undefined;
    const sentPalletsRaw = form.get("sentPallets");
    const sentM2Raw = form.get("sentM2");
    const sentPiecesRaw = form.get("sentPieces");
    const sentPallets = sentPalletsRaw != null && String(sentPalletsRaw) !== ""
      ? Number(sentPalletsRaw)
      : undefined;
    const sentM2 = sentM2Raw != null && String(sentM2Raw) !== ""
      ? Number(sentM2Raw)
      : undefined;
    const sentPieces = sentPiecesRaw != null && String(sentPiecesRaw) !== ""
      ? Number(sentPiecesRaw)
      : undefined;

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
      sentPallets: Number.isFinite(sentPallets) ? sentPallets : undefined,
      sentM2: Number.isFinite(sentM2) ? sentM2 : undefined,
      sentPieces: Number.isFinite(sentPieces) ? sentPieces : undefined,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[portal/proof]", err);
    const message =
      err instanceof Error ? err.message : "Server error saving proof";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
