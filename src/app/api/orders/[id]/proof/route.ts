import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/auth/api-guard";
import {
  submitAdminDeliveryProof,
} from "@/lib/services/delivery-proofs";
import type { DeliveryProofPhase } from "@/lib/constants";

export const runtime = "nodejs";

const ADMIN_PHASES = new Set<DeliveryProofPhase>([
  "prepared",
  "loaded",
  "load_skipped",
  "departed",
  "arrived",
  "delivered",
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isFinite(orderId)) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  let phase: DeliveryProofPhase | null = null;
  let notes: string | undefined;
  let employeeId: number | undefined;
  let force = false;
  let allowDeliveredWithoutPhoto = false;
  let photoBuffer: Buffer | undefined;
  let photoMime: string | undefined;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const rawPhase = String(form.get("phase") ?? "");
    if (ADMIN_PHASES.has(rawPhase as DeliveryProofPhase)) {
      phase = rawPhase as DeliveryProofPhase;
    }
    notes = String(form.get("notes") ?? "").trim() || undefined;
    const rawEmployeeId = String(form.get("employeeId") ?? "");
    if (rawEmployeeId) employeeId = Number(rawEmployeeId);
    force = String(form.get("force") ?? "") === "true";
    allowDeliveredWithoutPhoto =
      String(form.get("allowDeliveredWithoutPhoto") ?? "") === "true";
    const photo = form.get("photo");
    if (photo instanceof File && photo.size > 0) {
      photoBuffer = Buffer.from(await photo.arrayBuffer());
      photoMime = photo.type || "image/jpeg";
    }
  } else {
    const body = (await request.json()) as {
      phase?: DeliveryProofPhase;
      notes?: string;
      employeeId?: number;
      force?: boolean;
      allowDeliveredWithoutPhoto?: boolean;
    };
    if (body.phase && ADMIN_PHASES.has(body.phase)) phase = body.phase;
    notes = body.notes?.trim() || undefined;
    employeeId = body.employeeId;
    force = Boolean(body.force);
    allowDeliveredWithoutPhoto = Boolean(body.allowDeliveredWithoutPhoto);
  }

  if (!phase) {
    return NextResponse.json({ error: "Valid phase is required" }, { status: 400 });
  }

  const result = await submitAdminDeliveryProof({
    orderId,
    phase,
    employeeId,
    notes,
    photoBuffer,
    photoMime,
    force,
    allowDeliveredWithoutPhoto:
      allowDeliveredWithoutPhoto || phase === "delivered",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
