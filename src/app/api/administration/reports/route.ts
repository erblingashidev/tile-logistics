import { NextRequest, NextResponse } from "next/server";
import {
  canViewAdministrationReports,
  requireAdministrationRead,
} from "@/lib/auth/administration-api";
import { runWithTenantOrganizationAsync } from "@/lib/organizations/tenant-context";
import { getRegisterReportSummary } from "@/lib/services/administration-register";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireAdministrationRead();
  if (!auth.ok) return auth.response;
  if (!canViewAdministrationReports(auth.session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const sp = request.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  if (!from || !to) {
    return NextResponse.json(
      { error: "from and to query params required (ISO dates)" },
      { status: 400 }
    );
  }
  return runWithTenantOrganizationAsync(auth.organizationId, async () => {
    const summary = await getRegisterReportSummary(
      auth.organizationId,
      from,
      to
    );
    return NextResponse.json(summary);
  });
}
