import { NextRequest, NextResponse } from "next/server";
import { requireAdministrationRead } from "@/lib/auth/administration-api";
import { runWithTenantOrganizationAsync } from "@/lib/organizations/tenant-context";
import {
  buildClientFinanceProfiles,
  computeReceivablesSummary,
  listOpenDebtInvoices,
  listOverdueDebts,
} from "@/lib/services/administration-clients";
import { getRegisterFinanceOverview } from "@/lib/services/administration-register";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireAdministrationRead();
  if (!auth.ok) return auth.response;

  const sp = request.nextUrl.searchParams;
  const from =
    sp.get("from")?.trim() ||
    `${new Date().getFullYear()}-01-01T00:00:00.000Z`;
  const to =
    sp.get("to")?.trim() ||
    `${new Date().toISOString().slice(0, 10)}T23:59:59.999Z`;

  try {
    return await runWithTenantOrganizationAsync(auth.organizationId, async () => {
    const profiles = await buildClientFinanceProfiles(auth.organizationId);
    const receivables = computeReceivablesSummary(profiles);
    const register = await getRegisterFinanceOverview(
      auth.organizationId,
      from,
      to
    );
    const openDebtInvoices = listOpenDebtInvoices(profiles);
    const overdueDebts = listOverdueDebts(profiles, 14);

    return NextResponse.json({
      period: { from, to },
      receivables,
      register,
      openDebtInvoices: openDebtInvoices.length,
      overdueDebtInvoices: overdueDebts.length,
    });
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load finance summary";
    console.error("[administration/finance/summary]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
