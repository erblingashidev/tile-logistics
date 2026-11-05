import type { SessionUser } from "@/lib/auth/session";
import { isSalesAdmin } from "@/lib/employee-categories";
import { invoiceRowHasSalesAgent } from "@/lib/administration/validation";
import {
  buildClientFinanceProfiles,
  filterProfilesForBusinessDay,
  listCallQueue,
  listDebts,
  listOpenDebtInvoices,
  type ClientFinanceProfile,
  type OverdueDebtItem,
} from "@/lib/services/administration-clients";
import { normalizeBusinessDay } from "@/lib/administration/prodata-invoice-conflicts";
import {
  normalizePersonName,
  type SalesPortalOrderFilters,
} from "@/lib/services/sales-portal";

export type SalesReceivablesContext = {
  employeeId: number;
  employeeName: string;
  viewAsAgentId: number | null;
};

function agentContextFromSession(
  session: Extract<SessionUser, { role: "employee" }>,
  filters: Pick<SalesPortalOrderFilters, "salesAgentId">
): SalesReceivablesContext {
  if (isSalesAdmin(session.roles) && filters.salesAgentId != null) {
    return {
      employeeId: session.employeeId,
      employeeName: session.name,
      viewAsAgentId: filters.salesAgentId,
    };
  }
  return {
    employeeId: session.employeeId,
    employeeName: session.name,
    viewAsAgentId: null,
  };
}

export function invoiceMatchesSalesContext(
  inv: {
    salesEmployeeId: number | null;
    salesAgentName: string | null;
  },
  ctx: SalesReceivablesContext
): boolean {
  if (ctx.viewAsAgentId != null) {
    return inv.salesEmployeeId === ctx.viewAsAgentId;
  }
  if (inv.salesEmployeeId === ctx.employeeId) return true;
  const agentName = inv.salesAgentName?.trim();
  if (!agentName) return false;
  return normalizePersonName(agentName) === normalizePersonName(ctx.employeeName);
}

export function filterProfilesForSalesAgent(
  profiles: ClientFinanceProfile[],
  ctx: SalesReceivablesContext
): ClientFinanceProfile[] {
  return profiles.filter((p) =>
    p.invoices.some(
      (inv) =>
        inv.invoiceNumber.trim() &&
        invoiceRowHasSalesAgent(inv) &&
        invoiceMatchesSalesContext(inv, ctx)
    )
  );
}

export function filterDebtItemsForSalesAgent(
  items: OverdueDebtItem[],
  ctx: SalesReceivablesContext
): OverdueDebtItem[] {
  return items.filter((item) =>
    invoiceMatchesSalesContext(
      {
        salesEmployeeId: item.salesEmployeeId,
        salesAgentName: item.salesAgentName,
      },
      ctx
    )
  );
}

export async function listReceivablesForSalesPortal(
  session: Extract<SessionUser, { role: "employee" }>,
  organizationId: number,
  filters: Pick<SalesPortalOrderFilters, "salesAgentId"> & {
    businessDay?: string | null;
  } = {}
) {
  const ctx = agentContextFromSession(session, filters);
  const businessDay = normalizeBusinessDay(filters.businessDay);
  const all = await buildClientFinanceProfiles(organizationId);
  const scoped = businessDay
    ? filterProfilesForBusinessDay(all, businessDay)
    : all;
  const clients = filterProfilesForSalesAgent(scoped, ctx);
  const openDebts = filterDebtItemsForSalesAgent(
    listOpenDebtInvoices(scoped),
    ctx
  );
  const debts = listDebts(clients);
  const callList = listCallQueue(clients);

  return {
    clients,
    debts,
    openDebts,
    callList,
    summary: {
      clientCount: clients.length,
      clientsWithDebt: debts.length,
      openInvoiceCount: openDebts.length,
      totalDebtCents: openDebts.reduce((s, i) => s + i.balanceDueCents, 0),
      callListCount: callList.length,
    },
  };
}
