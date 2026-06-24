import { NextResponse } from "next/server";
import { verifyAdminPin } from "@/lib/auth/admin-pin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const pin = String(body.pin ?? "");
  if (!verifyAdminPin(pin)) {
    return NextResponse.json(
      { ok: false, error: "Incorrect admin PIN." },
      { status: 403 }
    );
  }
  return NextResponse.json({ ok: true });
}
