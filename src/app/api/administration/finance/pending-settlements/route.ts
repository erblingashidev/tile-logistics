import { NextResponse } from "next/server";
import { requireAdministrationRead } from "@/lib/auth/administration-api";
import { runWithTenantOrganizationAsync } from "@/lib/organizations/tenant-context";
import { listProDataInvoicesPendingAssignment } from "@/lib/services/finance-prodata-import";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdministrationRead();
  if (!auth.ok) return auth.response;

  return runWithTenantOrganizationAsync(auth.organizationId, async () => {
    const invoices = await listProDataInvoicesPendingAssignment(
      auth.organizationId
    );
    return NextResponse.json({ invoices, count: invoices.length });
  });
}
