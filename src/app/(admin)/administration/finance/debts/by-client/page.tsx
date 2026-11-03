"use client";

import { useMemo, useState } from "react";
import {
  ClientReportCard,
} from "@/components/administration/AdministrationClientFinance";
import { formatAdminMoney } from "@/components/administration/AdministrationLedgerTable";
import { FinanceDebtFilters } from "@/components/administration/finance/FinanceDebtFilters";
import { FinancePageShell } from "@/components/administration/finance/FinancePageShell";
import { useFinanceDebts } from "@/components/administration/finance/useFinanceDebts";
import { Alert, Button, Card, EmptyState, LoadingState } from "@/components/ui";

function ClientDebtRow({
  displayName,
  balanceDueCents,
  invoiceCount,
  callReasons,
  onOpen,
}: {
  displayName: string;
  balanceDueCents: number;
  invoiceCount: number;
  callReasons: string[];
  onOpen: () => void;
}) {
  return (
    <tr className="border-t border-zinc-100 hover:bg-zinc-50/80">
      <td className="px-3 py-2 font-medium text-zinc-900">{displayName}</td>
      <td className="px-3 py-2">{formatAdminMoney(balanceDueCents)}</td>
      <td className="px-3 py-2">{invoiceCount}</td>
      <td className="px-3 py-2 max-w-xs text-xs text-zinc-600">
        {callReasons.join(" · ") || "—"}
      </td>
      <td className="px-3 py-2 text-right">
        <Button size="sm" variant="secondary" onClick={onOpen}>
          Client card
        </Button>
      </td>
    </tr>
  );
}

export default function FinanceDebtsByClientPage() {
  const { loading, error, data, selected, setSelected, openClient } =
    useFinanceDebts();
  const [clientSearch, setClientSearch] = useState("");
  const [agent, setAgent] = useState("");

  const agentOptions = useMemo(
    () =>
      [
        ...new Set(
          (data?.openDebtInvoices ?? []).map((i) => i.salesAgentName)
        ),
      ].sort(),
    [data]
  );

  const clientKeysForAgent = useMemo(() => {
    if (!agent || !data) return null;
    return new Set(
      data.openDebtInvoices
        .filter((i) => i.salesAgentName === agent)
        .map((i) => i.clientKey)
    );
  }, [agent, data]);

  const filteredDebts = useMemo(() => {
    if (!data) return [];
    const q = clientSearch.trim().toLowerCase();
    return data.debts.filter((p) => {
      if (q && !p.displayName.toLowerCase().includes(q)) return false;
      if (clientKeysForAgent && !clientKeysForAgent.has(p.clientKey)) return false;
      return true;
    });
  }, [data, clientSearch, clientKeysForAgent]);

  const filteredCallList = useMemo(() => {
    if (!data) return [];
    const q = clientSearch.trim().toLowerCase();
    return data.callList.filter((p) => {
      if (q && !p.displayName.toLowerCase().includes(q)) return false;
      if (clientKeysForAgent && !clientKeysForAgent.has(p.clientKey)) return false;
      return true;
    });
  }, [data, clientSearch, clientKeysForAgent]);

  return (
    <FinancePageShell
      title="Debts by client"
      description="One row per client with total balance due, plus a call list for follow-up. Invoice-level detail is on Open debts."
    >
      {error ? <Alert tone="error">{error}</Alert> : null}

      {loading ? (
        <LoadingState title="Loading clients…" />
      ) : data ? (
        <div className="space-y-10">
          <FinanceDebtFilters
            agent={agent}
            onAgentChange={setAgent}
            agentOptions={agentOptions}
            clientSearch={clientSearch}
            onClientSearchChange={setClientSearch}
            minDays="0"
            onMinDaysChange={() => {}}
            showMinDays={false}
            onClear={() => {
              setAgent("");
              setClientSearch("");
            }}
          />

          <section>
            <h2 className="mb-2 text-sm font-semibold text-zinc-900">
              Clients with open balance
            </h2>
            <Card className="overflow-x-auto">
              {filteredDebts.length === 0 ? (
                <EmptyState title="No clients match these filters." />
              ) : (
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">Client</th>
                      <th className="px-3 py-2">Balance due</th>
                      <th className="px-3 py-2">Invoices</th>
                      <th className="px-3 py-2">Notes</th>
                      <th className="px-3 py-2 text-right">Report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDebts.map((p) => (
                      <ClientDebtRow
                        key={p.clientKey}
                        displayName={p.displayName}
                        balanceDueCents={p.balanceDueCents}
                        invoiceCount={p.invoiceCount}
                        callReasons={p.callReasons}
                        onOpen={() => void openClient(p.clientKey)}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-zinc-900">To call list</h2>
            <p className="mb-3 text-sm text-zinc-600">
              Clients flagged for follow-up (unpaid balance, on-account lines with
              invoice, delivered-but-unpaid, or 14+ days overdue).
            </p>
            <Card className="overflow-x-auto">
              {filteredCallList.length === 0 ? (
                <EmptyState title="Nobody on the call list for these filters." />
              ) : (
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">Client</th>
                      <th className="px-3 py-2">Balance due</th>
                      <th className="px-3 py-2">Invoices</th>
                      <th className="px-3 py-2">Why call</th>
                      <th className="px-3 py-2 text-right">Report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCallList.map((p) => (
                      <ClientDebtRow
                        key={p.clientKey}
                        displayName={p.displayName}
                        balanceDueCents={p.balanceDueCents}
                        invoiceCount={p.invoiceCount}
                        callReasons={p.callReasons}
                        onOpen={() => void openClient(p.clientKey)}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </section>
        </div>
      ) : null}

      {selected ? (
        <ClientReportCard profile={selected} onClose={() => setSelected(null)} />
      ) : null}
    </FinancePageShell>
  );
}
