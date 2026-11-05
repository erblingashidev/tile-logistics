import { NextRequest, NextResponse } from "next/server";
import { requireAdministrationRead } from "@/lib/auth/administration-api";
import { normalizeBusinessDay } from "@/lib/administration/prodata-invoice-conflicts";
import { runWithTenantOrganizationAsync } from "@/lib/organizations/tenant-context";
import { listInvoiceConflictsForBusinessDay } from "@/lib/services/finance-prodata-import";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireAdministrationRead();
  if (!auth.ok) return auth.response;

  const day =
    normalizeBusinessDay(request.nextUrl.searchParams.get("day")) ??
    new Date().toISOString().slice(0, 10);

  return runWithTenantOrganizationAsync(auth.organizationId, async () => {
    const conflicts = await listInvoiceConflictsForBusinessDay(
      auth.organizationId,
      day
    );
    return NextResponse.json({ conflicts, day });
  });
}
