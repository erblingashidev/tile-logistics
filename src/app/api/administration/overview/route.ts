import { NextRequest, NextResponse } from "next/server";
import { requireAdministrationRead } from "@/lib/auth/administration-api";
import { runWithTenantOrganizationAsync } from "@/lib/organizations/tenant-context";
import { getRegisterFinanceOverview } from "@/lib/services/administration-register";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireAdministrationRead();
  if (!auth.ok) return auth.response;
  const sp = request.nextUrl.searchParams;
  const from =
    sp.get("from") ??
    `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
  const to =
    sp.get("to") ??
    `${new Date().toISOString().slice(0, 10)}T23:59:59.999Z`;

  return runWithTenantOrganizationAsync(auth.organizationId, async () => {
    const overview = await getRegisterFinanceOverview(
      auth.organizationId,
      from,
      to
    );
    return NextResponse.json({ overview });
  });
}
