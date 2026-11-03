import { NextRequest, NextResponse } from "next/server";
import { requireAdministrationRead } from "@/lib/auth/administration-api";
import { runWithTenantOrganizationAsync } from "@/lib/organizations/tenant-context";
import {
  buildClientFinanceProfiles,
  computeReceivablesSummary,
  getClientFinanceProfile,
  groupDebtInvoicesByAgent,
  groupOverdueDebtsByAgent,
  listCallQueue,
  listDebts,
  listOpenDebtInvoices,
  listOverdueDebts,
  normalizeClientKey,
} from "@/lib/services/administration-clients";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireAdministrationRead();
  if (!auth.ok) return auth.response;

  const clientKey = request.nextUrl.searchParams.get("clientKey");

  try {
    return await runWithTenantOrganizationAsync(auth.organizationId, async () => {
    if (clientKey?.trim()) {
      const profile = await getClientFinanceProfile(
        auth.organizationId,
        normalizeClientKey(clientKey)
      );
      if (!profile) {
        return NextResponse.json({ error: "Client not found" }, { status: 404 });
      }
      return NextResponse.json({ profile });
    }

    const clients = await buildClientFinanceProfiles(auth.organizationId);
    const overdueDays = Number(
      request.nextUrl.searchParams.get("overdueDays") ?? "14"
    );
    const overdueDebts = listOverdueDebts(
      clients,
      Number.isFinite(overdueDays) ? overdueDays : 14
    );
    const openDebtInvoices = listOpenDebtInvoices(clients);
    return NextResponse.json({
      clients,
      summary: computeReceivablesSummary(clients),
      debts: listDebts(clients),
      callList: listCallQueue(clients),
      openDebtInvoices,
      debtsByAgent: groupDebtInvoicesByAgent(openDebtInvoices),
      overdueDebts,
      overdueByAgent: groupOverdueDebtsByAgent(overdueDebts),
    });
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load finance data";
    console.error("[administration/clients]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
