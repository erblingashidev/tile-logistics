import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { requireAdministrationRead } from "@/lib/auth/administration-api";
import { runWithTenantOrganizationAsync } from "@/lib/organizations/tenant-context";
import {
  getAdministrationSettings,
  updateAdministrationSettings,
} from "@/lib/services/administration-settings";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdministrationRead();
  if (!auth.ok) return auth.response;
  return runWithTenantOrganizationAsync(auth.organizationId, async () => {
    const settings = await getAdministrationSettings(auth.organizationId);
    return NextResponse.json({ settings });
  });
}

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const auth = await requireAdministrationRead();
  if (!auth.ok) return auth.response;
  const body = (await request.json()) as Record<string, unknown>;
  return runWithTenantOrganizationAsync(auth.organizationId, async () => {
    const settings = await updateAdministrationSettings(auth.organizationId, {
      cashRegisterEnabled:
        body.cashRegisterEnabled === true
          ? true
          : body.cashRegisterEnabled === false
            ? false
            : undefined,
      registerStrictTraceability:
        body.registerStrictTraceability === true
          ? true
          : body.registerStrictTraceability === false
            ? false
            : undefined,
    });
    return NextResponse.json({ settings });
  });
}
