import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  OrganizationError,
  getOrganizationById,
  setOrganizationStatus,
} from "@/lib/services/organizations";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePlatformAdmin();
    const { id } = await params;
    const org = await getOrganizationById(Number(id));
    if (!org) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ organization: org });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePlatformAdmin();
    const { id } = await params;
    const body = (await request.json()) as { status?: string };
    if (!body.status?.trim()) {
      return NextResponse.json({ error: "status is required" }, { status: 400 });
    }
    const organization = await setOrganizationStatus(
      Number(id),
      body.status
    );
    return NextResponse.json({ organization });
  } catch (err) {
    if (err instanceof OrganizationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
