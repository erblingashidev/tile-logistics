import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/auth/api-guard";
import { verifyAdminPin } from "@/lib/auth/admin-pin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const pin = String(body.pin ?? "");
  if (!(await verifyAdminPin(pin))) {
    return NextResponse.json(
      { ok: false, error: "Incorrect admin PIN." },
      { status: 403 }
    );
  }
  return NextResponse.json({ ok: true });
}
