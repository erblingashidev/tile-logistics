"use client";

import { useMemo, useState } from "react";
import {
  ClientReportCard,
} from "@/components/administration/AdministrationClientFinance";
import { formatAdminMoney } from "@/components/administration/AdministrationLedgerTable";
import {
  filterDebtLines,
  FinanceDebtFilters,
} from "@/components/administration/finance/FinanceDebtFilters";
import { FinancePageShell } from "@/components/administration/finance/FinancePageShell";
import { OpenDebtsTable } from "@/components/administration/finance/OpenDebtsTable";
import { useFinanceDebts } from "@/components/administration/finance/useFinanceDebts";
import { Alert, Card, LoadingState } from "@/components/ui";

export default function FinanceOpenDebtsPage() {
  const { loading, error, data, selected, setSelected, openClient } =
    useFinanceDebts();
  const [agent, setAgent] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [minDays, setMinDays] = useState("0");

  const agentOptions = useMemo(
    () =>
      [
        ...new Set(
          (data?.openDebtInvoices ?? []).map((i) => i.salesAgentName)
        ),
      ].sort(),
    [data]
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    return filterDebtLines(
      data.openDebtInvoices,
      agent,
      clientSearch,
      Number(minDays) || 0
    );
  }, [data, agent, clientSearch, minDays]);

  const filteredTotal = filtered.reduce((s, r) => s + r.balanceDueCents, 0);

  return (
    <FinancePageShell
      title="Open debts"
      description="Every invoice with a remaining balance (matched to orders and register payments). Use filters or open Debts by agent / by client for grouped views."
    >
      {error ? <Alert tone="error">{error}</Alert> : null}

      {loading ? (
        <LoadingState title="Loading open debts…" />
      ) : data ? (
        <>
          <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-zinc-500">All open debt</p>
              <p className="text-xl font-semibold text-red-700">
                {formatAdminMoney(data.summary.totalDebtCents)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Open invoices</p>
              <p className="text-xl font-semibold">{data.summary.openInvoiceCount}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Filtered total due</p>
              <p className="text-xl font-semibold text-red-700">
                {formatAdminMoney(filteredTotal)}
              </p>
            </div>
          </Card>

          <FinanceDebtFilters
            agent={agent}
            onAgentChange={setAgent}
            agentOptions={agentOptions}
            clientSearch={clientSearch}
            onClientSearchChange={setClientSearch}
            minDays={minDays}
            onMinDaysChange={setMinDays}
            onClear={() => {
              setAgent("");
              setClientSearch("");
              setMinDays("0");
            }}
          />

          <OpenDebtsTable rows={filtered} onOpenClient={(k) => void openClient(k)} />
        </>
      ) : null}

      {selected ? (
        <ClientReportCard profile={selected} onClose={() => setSelected(null)} />
      ) : null}
    </FinancePageShell>
  );
}
