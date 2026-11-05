"use client";

import { useMemo, useState } from "react";
import { ClientReportCard } from "@/components/administration/AdministrationClientFinance";
import { formatAdminMoney } from "@/components/administration/AdministrationLedgerTable";
import { FinanceDuplicateReview } from "@/components/administration/finance/FinanceDuplicateReview";
import { FinancePageShell } from "@/components/administration/finance/FinancePageShell";
import { OpenDebtsTable } from "@/components/administration/finance/OpenDebtsTable";
import {
  useFinanceBusinessDay,
  useFinanceSearch,
} from "@/components/administration/finance/FinanceSearchProvider";
import { useFinanceDebts } from "@/components/administration/finance/useFinanceDebts";
import {
  debtInvoiceMatchesSearch,
  financeTextMatchesQuery,
} from "@/lib/administration/finance-search";
import { useAppMessages } from "@/components/i18n/LocaleProvider";
import { Alert, Button, Card, EmptyState, LoadingState, Select } from "@/components/ui";

export default function FinanceDebtsByAgentPage() {
  const t = useAppMessages();
  const p = t.finance.pages.byAgent;
  const { businessDay } = useFinanceBusinessDay();
  const { loading, error, data, selected, setSelected, openClient } =
    useFinanceDebts(14, businessDay);
  const { query } = useFinanceSearch();
  const [agentFilter, setAgentFilter] = useState("");

  const groups = data?.debtsByAgent ?? [];

  const visibleGroups = useMemo(() => {
    if (!query.trim()) return groups;
    return groups.filter(
      (g) =>
        financeTextMatchesQuery(g.salesAgentName, query) ||
        g.items.some((item) => debtInvoiceMatchesSearch(item, query))
    );
  }, [groups, query]);

  const activeGroup = useMemo(() => {
    if (!agentFilter) return null;
    return groups.find((g) => g.salesAgentName === agentFilter) ?? null;
  }, [groups, agentFilter]);

  const tableRows = useMemo(() => {
    const rows = activeGroup?.items ?? [];
    if (!query.trim()) return rows;
    return rows.filter((row) => debtInvoiceMatchesSearch(row, query));
  }, [activeGroup, query]);

  return (
    <FinancePageShell title={p.title}>
      {error ? <Alert tone="error">{error}</Alert> : null}

      {loading ? (
        <LoadingState title={p.loading} />
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState title={p.noAgents} />
        </Card>
      ) : visibleGroups.length === 0 ? (
        <Card>
          <EmptyState title={p.noSearchMatch} />
        </Card>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visibleGroups.map((group) => (
              <Card key={group.salesAgentName} className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {p.salesAgent}
                </p>
                <p className="mt-1 font-semibold text-zinc-900">
                  {group.salesAgentName}
                </p>
                <p className="mt-2 text-lg font-semibold text-red-700">
                  {formatAdminMoney(group.totalDueCents)}
                </p>
                <p className="text-xs text-zinc-500">
                  {group.clientCount} client(s) · {group.items.length} invoice(s)
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  onClick={() => setAgentFilter(group.salesAgentName)}
                >
                  {p.viewInvoices}
                </Button>
              </Card>
            ))}
          </div>

          <Select
            label={p.focusAgent}
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
          >
            <option value="">{p.selectAgent}</option>
            {groups.map((g) => (
              <option key={g.salesAgentName} value={g.salesAgentName}>
                {g.salesAgentName} ({formatAdminMoney(g.totalDueCents)})
              </option>
            ))}
          </Select>

          {agentFilter ? (
            <div className="mt-6">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-zinc-900">
                  {p.invoicesFor} {agentFilter}
                </h2>
                <Button size="sm" variant="ghost" onClick={() => setAgentFilter("")}>
                  {p.clear}
                </Button>
              </div>
              <OpenDebtsTable
                rows={tableRows}
                onOpenClient={(k) => void openClient(k)}
              />
            </div>
          ) : null}
        </>
      )}

      {selected ? (
        <ClientReportCard profile={selected} onClose={() => setSelected(null)} />
      ) : null}

      <FinanceDuplicateReview />
    </FinancePageShell>
  );
}
