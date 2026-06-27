import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import type { SessionUser } from "@/lib/auth/session";

export async function requireApiSession(): Promise<
  | { ok: true; session: SessionUser }
  | { ok: false; response: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, session };
}

export async function requireApiAdmin(): Promise<
  | { ok: true; session: Extract<SessionUser, { role: "admin" }> }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireApiSession();
  if (!auth.ok) return auth;
  if (auth.session.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, session: auth.session };
}
