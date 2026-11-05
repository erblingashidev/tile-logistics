"use client";

import { useMemo, useState } from "react";
import {
  useFinanceBusinessDay,
  useFinanceSearch,
} from "@/components/administration/finance/FinanceSearchProvider";
import { FinanceDuplicateReview } from "@/components/administration/finance/FinanceDuplicateReview";
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
import { useAppMessages } from "@/components/i18n/LocaleProvider";
import { Alert, Card, LoadingState } from "@/components/ui";

export default function FinanceOpenDebtsPage() {
  const t = useAppMessages();
  const p = t.finance.pages.openDebts;
  const { businessDay } = useFinanceBusinessDay();
  const { loading, error, data, selected, setSelected, openClient } =
    useFinanceDebts(14, businessDay);
  const { query } = useFinanceSearch();
  const [agent, setAgent] = useState("");
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
      query,
      Number(minDays) || 0
    );
  }, [data, agent, query, minDays]);

  const filteredTotal = filtered.reduce((s, r) => s + r.balanceDueCents, 0);

  return (
    <FinancePageShell title={p.title}>
      {error ? <Alert tone="error">{error}</Alert> : null}

      {loading ? (
        <LoadingState title={p.loading} />
      ) : data ? (
        <>
          <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-zinc-500">{p.allOpenDebt}</p>
              <p className="text-xl font-semibold text-red-700">
                {formatAdminMoney(data.summary.totalDebtCents)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">{p.openInvoices}</p>
              <p className="text-xl font-semibold">{data.summary.openInvoiceCount}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">{p.filteredTotalDue}</p>
              <p className="text-xl font-semibold text-red-700">
                {formatAdminMoney(filteredTotal)}
              </p>
            </div>
          </Card>

          <FinanceDebtFilters
            agent={agent}
            onAgentChange={setAgent}
            agentOptions={agentOptions}
            minDays={minDays}
            onMinDaysChange={setMinDays}
            onClear={() => {
              setAgent("");
              setMinDays("0");
            }}
          />

          <OpenDebtsTable
            rows={filtered}
            onOpenClient={(k) => void openClient(k)}
          />
        </>
      ) : null}

      {selected ? (
        <ClientReportCard profile={selected} onClose={() => setSelected(null)} />
      ) : null}

      <FinanceDuplicateReview />
    </FinancePageShell>
  );
}
