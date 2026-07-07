import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/auth/api-guard";
import {
  AdminCredentialError,
  createAdmin,
  listAdmins,
  type AdminPayload,
} from "@/lib/services/admins";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  try {
    return NextResponse.json(await listAdmins());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load admins";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as AdminPayload;
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!body.username?.trim()) {
    return NextResponse.json({ error: "Username is required" }, { status: 400 });
  }
  if (!body.password?.trim()) {
    return NextResponse.json({ error: "Password is required" }, { status: 400 });
  }

  try {
    const admin = await createAdmin(body);
    return NextResponse.json(admin, { status: 201 });
  } catch (err) {
    if (err instanceof AdminCredentialError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
