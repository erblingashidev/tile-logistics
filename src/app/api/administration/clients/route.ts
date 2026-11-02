import { NextRequest, NextResponse } from "next/server";
import { requireAdministrationRead } from "@/lib/auth/administration-api";
import { runWithTenantOrganizationAsync } from "@/lib/organizations/tenant-context";
import {
  buildClientFinanceProfiles,
  getClientFinanceProfile,
  groupOverdueDebtsByAgent,
  listCallQueue,
  listDebts,
  listOverdueDebts,
  normalizeClientKey,
} from "@/lib/services/administration-clients";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireAdministrationRead();
  if (!auth.ok) return auth.response;

  const clientKey = request.nextUrl.searchParams.get("clientKey");

  return runWithTenantOrganizationAsync(auth.organizationId, async () => {
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
    return NextResponse.json({
      clients,
      debts: listDebts(clients),
      callList: listCallQueue(clients),
      overdueDebts,
      overdueByAgent: groupOverdueDebtsByAgent(overdueDebts),
    });
  });
}
