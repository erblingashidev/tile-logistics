import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import type { SessionUser } from "@/lib/auth/session";
import { isSalesStaff } from "@/lib/employee-categories";
import {
  bindTenantOrganization,
  resolveSessionOrganizationId,
  resolveTenantOrganizationId,
  runWithTenantOrganizationAsync,
} from "@/lib/organizations/tenant-context";
import { assertSessionCanAccessOrganization } from "@/lib/organizations/tenant-access";
import { TenantAccessError } from "@/lib/organizations/tenant-access-error";

async function bindRequestTenant(session: SessionUser): Promise<void> {
  try {
    const organizationId = await resolveTenantOrganizationId();
    bindTenantOrganization(organizationId);
    return;
  } catch {
    /* fall back to session-only tenant */
  }
  const organizationId = resolveSessionOrganizationId(session);
  if (organizationId) bindTenantOrganization(organizationId);
}

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
  await bindRequestTenant(session);
  return { ok: true, session };
}

export async function requireApiTenantSession(): Promise<
  | { ok: true; session: SessionUser; organizationId: number }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireApiSession();
  if (!auth.ok) return auth;
  let organizationId: number;
  try {
    organizationId = await resolveTenantOrganizationId();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Select a company before accessing this data." },
        { status: 403 }
      ),
    };
  }
  try {
    assertSessionCanAccessOrganization(auth.session, organizationId);
  } catch (err) {
    if (err instanceof TenantAccessError) {
      return {
        ok: false,
        response: NextResponse.json({ error: err.message }, { status: 403 }),
      };
    }
    throw err;
  }
  return { ok: true, session: auth.session, organizationId };
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

/** Admin with an active company selected (company admin or platform admin in a tenant). */
export async function requireApiCompanyAdmin(): Promise<
  | {
      ok: true;
      session: Extract<SessionUser, { role: "admin" }>;
      organizationId: number;
    }
  | { ok: false; response: NextResponse }
> {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth;
  const tenant = await requireApiTenantSession();
  if (!tenant.ok) return tenant;
  if (tenant.session.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return {
    ok: true,
    session: tenant.session as Extract<SessionUser, { role: "admin" }>,
    organizationId: tenant.organizationId,
  };
}

/** Run a company-scoped API handler with tenant context bound for the whole call stack. */
export async function runApiCompanyAdmin<T>(
  fn: (ctx: {
    session: Extract<SessionUser, { role: "admin" }>;
    organizationId: number;
  }) => Promise<T>
): Promise<T | NextResponse> {
  const auth = await requireApiCompanyAdmin();
  if (!auth.ok) return auth.response;
  return runWithTenantOrganizationAsync(auth.organizationId, () =>
    fn({ session: auth.session, organizationId: auth.organizationId })
  );
}

/** Any authenticated user with a resolved tenant (admin or employee). */
export async function runApiWithTenant<T>(
  fn: (ctx: {
    session: SessionUser;
    organizationId: number;
  }) => Promise<T>
): Promise<T | NextResponse> {
  const auth = await requireApiTenantSession();
  if (!auth.ok) return auth.response;
  return runWithTenantOrganizationAsync(auth.organizationId, () =>
    fn({ session: auth.session, organizationId: auth.organizationId })
  );
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
