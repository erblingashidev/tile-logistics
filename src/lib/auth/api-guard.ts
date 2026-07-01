import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import type { SessionUser } from "@/lib/auth/session";
import { isSalesStaff } from "@/lib/employee-categories";

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

export async function requireSalesStaffSession(): Promise<
  | { ok: true; session: Extract<SessionUser, { role: "employee" }> }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireApiSession();
  if (!auth.ok) return auth;
  if (auth.session.role !== "employee" || !isSalesStaff(auth.session.roles)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, session: auth.session };
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

/** Sales staff may only read orders — block POST/PUT/PATCH/DELETE. */
export function salesWriteForbidden(
  session: SessionUser,
  method: string
): NextResponse | null {
  if (method === "GET" || method === "HEAD") return null;
  if (session.role === "employee" && isSalesStaff(session.roles)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function requireApiSessionNoSalesWrite(
  method: string
): Promise<
  | { ok: true; session: SessionUser }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireApiSession();
  if (!auth.ok) return auth;
  const blocked = salesWriteForbidden(auth.session, method);
  if (blocked) return { ok: false, response: blocked };
  return auth;
}
