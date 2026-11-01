import { NextResponse } from "next/server";
import type { SessionUser } from "@/lib/auth/session";
import { sessionHasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { requireApiTenantSession } from "@/lib/auth/api-guard";

export async function requireAdministrationRead() {
  const auth = await requireApiTenantSession();
  if (!auth.ok) return auth;
  if (
    auth.session.role !== "admin" &&
    !sessionHasPermission(auth.session, PERMISSIONS.administrationRead)
  ) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return auth;
}

export async function requireAdministrationWrite() {
  const auth = await requireAdministrationRead();
  if (!auth.ok) return auth;
  if (
    auth.session.role !== "admin" &&
    !sessionHasPermission(auth.session, PERMISSIONS.administrationWrite)
  ) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return auth;
}

export function canViewAdministrationReports(session: SessionUser): boolean {
  if (session.role === "admin") return true;
  return sessionHasPermission(session, PERMISSIONS.administrationReports);
}
