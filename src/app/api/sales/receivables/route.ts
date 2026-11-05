import { NextRequest, NextResponse } from "next/server";
import { requireSalesStaffSession } from "@/lib/auth/api-guard";
import {
  resolveTenantOrganizationId,
  runWithTenantOrganizationAsync,
} from "@/lib/organizations/tenant-context";
import { listReceivablesForSalesPortal } from "@/lib/services/sales-receivables";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireSalesStaffSession();
  if (!auth.ok) return auth.response;

  const sp = request.nextUrl.searchParams;
  const salesAgentIdRaw = sp.get("salesAgentId");

  try {
    const organizationId = await resolveTenantOrganizationId();
    const payload = await runWithTenantOrganizationAsync(
      organizationId,
      async () =>
        listReceivablesForSalesPortal(auth.session, organizationId, {
          salesAgentId: salesAgentIdRaw ? Number(salesAgentIdRaw) : undefined,
        })
    );
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load receivables";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
