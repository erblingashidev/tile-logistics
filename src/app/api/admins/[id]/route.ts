import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/auth/api-guard";
import {
  AdminCredentialError,
  getAdmin,
  updateAdmin,
  type AdminPayload,
} from "@/lib/services/admins";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const admin = await getAdmin(Number(id));
  if (!admin) {
    return NextResponse.json({ error: "Admin not found" }, { status: 404 });
  }
  return NextResponse.json(admin);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const adminId = Number(id);
  const body = (await request.json()) as Partial<AdminPayload>;

  if (
    body.isActive === false &&
    auth.session.adminId === adminId
  ) {
    return NextResponse.json(
      { error: "You cannot deactivate your own account" },
      { status: 400 }
    );
  }

  try {
    const admin = await updateAdmin(adminId, body, {
      actorAdminId: auth.session.adminId,
    });
    if (!admin) {
      return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    }
    return NextResponse.json(admin);
  } catch (err) {
    if (err instanceof AdminCredentialError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
