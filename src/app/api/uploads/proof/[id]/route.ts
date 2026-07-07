import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDeliveryProofPhoto } from "@/lib/services/delivery-proofs";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const proofId = Number(id);
  if (!Number.isFinite(proofId) || proofId <= 0) {
    return NextResponse.json({ error: "Invalid proof" }, { status: 400 });
  }

  const photo = await getDeliveryProofPhoto(proofId);
  if (!photo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(photo.buffer, {
    headers: {
      "Content-Type": photo.mimeType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
