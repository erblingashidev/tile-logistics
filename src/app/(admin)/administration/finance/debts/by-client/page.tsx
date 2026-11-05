"use client";

import { useMemo, useState } from "react";
import {
  ClientReportCard,
} from "@/components/administration/AdministrationClientFinance";
import { formatAdminMoney } from "@/components/administration/AdministrationLedgerTable";
import { FinanceDebtFilters } from "@/components/administration/finance/FinanceDebtFilters";
import { useFinanceSearch } from "@/components/administration/finance/FinanceSearchProvider";
import { clientProfileMatchesSearch } from "@/lib/administration/finance-search";
import { FinancePageShell } from "@/components/administration/finance/FinancePageShell";
import { useFinanceDebts } from "@/components/administration/finance/useFinanceDebts";
import { useAppMessages } from "@/components/i18n/LocaleProvider";
import { callReasonLabel } from "@/lib/i18n/finance-labels";
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
  const t = useAppMessages();
  const p = t.finance.pages.byClient;
  const reasons = callReasons
    .map((reason) => callReasonLabel(t, reason))
    .join(" · ");
  return (
    <tr className="border-t border-zinc-100 hover:bg-zinc-50/80">
      <td className="px-3 py-2 font-medium text-zinc-900">{displayName}</td>
      <td className="px-3 py-2">{formatAdminMoney(balanceDueCents)}</td>
      <td className="px-3 py-2">{invoiceCount}</td>
      <td className="px-3 py-2 max-w-xs text-xs text-zinc-600">
        {reasons || "—"}
      </td>
      <td className="px-3 py-2 text-right">
        <Button size="sm" variant="secondary" onClick={onOpen}>
          {p.clientCard}
        </Button>
      </td>
    </tr>
  );
}

export default function FinanceDebtsByClientPage() {
  const t = useAppMessages();
  const page = t.finance.pages.byClient;
  const { loading, error, data, selected, setSelected, openClient } =
    useFinanceDebts();
  const { query } = useFinanceSearch();
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
    return data.debts.filter((p) => {
      if (!clientProfileMatchesSearch(p, query)) return false;
      if (clientKeysForAgent && !clientKeysForAgent.has(p.clientKey)) return false;
      return true;
    });
  }, [data, query, clientKeysForAgent]);

  const filteredCallList = useMemo(() => {
    if (!data) return [];
    return data.callList.filter((p) => {
      if (!clientProfileMatchesSearch(p, query)) return false;
      if (clientKeysForAgent && !clientKeysForAgent.has(p.clientKey)) return false;
      return true;
    });
  }, [data, query, clientKeysForAgent]);

  return (
    <FinancePageShell title={page.title} description={page.description}>
      {error ? <Alert tone="error">{error}</Alert> : null}

      {loading ? (
        <LoadingState title={page.loading} />
      ) : data ? (
        <div className="space-y-10">
          <FinanceDebtFilters
            agent={agent}
            onAgentChange={setAgent}
            agentOptions={agentOptions}
            minDays="0"
            onMinDaysChange={() => {}}
            showMinDays={false}
            onClear={() => {
              setAgent("");
            }}
          />

          <section>
            <h2 className="mb-2 text-sm font-semibold text-zinc-900">
              {page.clientsSection}
            </h2>
            <Card className="overflow-x-auto">
              {filteredDebts.length === 0 ? (
                <EmptyState title={page.noClients} />
              ) : (
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">{page.client}</th>
                      <th className="px-3 py-2">{page.balanceDue}</th>
                      <th className="px-3 py-2">{page.invoices}</th>
                      <th className="px-3 py-2">{page.notes}</th>
                      <th className="px-3 py-2 text-right">{page.report}</th>
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
            <h2 className="mb-2 text-sm font-semibold text-zinc-900">
              {page.callListSection}
            </h2>
            <p className="mb-3 text-sm text-zinc-600">{page.callListHint}</p>
            <Card className="overflow-x-auto">
              {filteredCallList.length === 0 ? (
                <EmptyState title={page.noCallList} />
              ) : (
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">{page.client}</th>
                      <th className="px-3 py-2">{page.balanceDue}</th>
                      <th className="px-3 py-2">{page.invoices}</th>
                      <th className="px-3 py-2">{page.whyCall}</th>
                      <th className="px-3 py-2 text-right">{page.report}</th>
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
