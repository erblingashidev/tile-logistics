"use client";

import { useMemo, useState } from "react";
import { ClientReportCard } from "@/components/administration/AdministrationClientFinance";
import { formatAdminMoney } from "@/components/administration/AdministrationLedgerTable";
import { FinancePageShell } from "@/components/administration/finance/FinancePageShell";
import { OpenDebtsTable } from "@/components/administration/finance/OpenDebtsTable";
import { useFinanceDebts } from "@/components/administration/finance/useFinanceDebts";
import { Alert, Button, Card, EmptyState, LoadingState, Select } from "@/components/ui";

export default function FinanceDebtsByAgentPage() {
  const { loading, error, data, selected, setSelected, openClient } =
    useFinanceDebts();
  const [agentFilter, setAgentFilter] = useState("");

  const groups = data?.debtsByAgent ?? [];

  const activeGroup = useMemo(() => {
    if (!agentFilter) return null;
    return groups.find((g) => g.salesAgentName === agentFilter) ?? null;
  }, [groups, agentFilter]);

  const tableRows = activeGroup?.items ?? [];

  return (
    <FinancePageShell
      title="Debts by sales agent"
      description="Totals per agent for follow-up and commission-style review. Matches how Finance Core groups overdue by referent."
    >
      {error ? <Alert tone="error">{error}</Alert> : null}

      {loading ? (
        <LoadingState title="Loading agent balances…" />
      ) : groups.length === 0 ? (
        <Card>
          <EmptyState title="No open debts with assigned agents." />
        </Card>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => (
              <Card key={group.salesAgentName} className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Sales agent
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
                  View invoices
                </Button>
              </Card>
            ))}
          </div>

          <Select
            label="Focus agent"
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
          >
            <option value="">Select an agent…</option>
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
                  Invoices — {agentFilter}
                </h2>
                <Button size="sm" variant="ghost" onClick={() => setAgentFilter("")}>
                  Clear
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
    </FinancePageShell>
  );
}
