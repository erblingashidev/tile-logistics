import { NextRequest, NextResponse } from "next/server";
import { requireAdministrationRead } from "@/lib/auth/administration-api";
import { runWithTenantOrganizationAsync } from "@/lib/organizations/tenant-context";
import { listProDataInvoicesPendingAssignment } from "@/lib/services/finance-prodata-import";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireAdministrationRead();
  if (!auth.ok) return auth.response;

  return runWithTenantOrganizationAsync(auth.organizationId, async () => {
    const day = request.nextUrl.searchParams.get("day");
    const invoices = await listProDataInvoicesPendingAssignment(
      auth.organizationId,
      day
    );
    return NextResponse.json({ invoices, count: invoices.length });
  });
}
