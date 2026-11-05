"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { formatAdminMoney } from "@/components/administration/AdministrationLedgerTable";
import { FinancePageShell } from "@/components/administration/finance/FinancePageShell";
import { useAppMessages } from "@/components/i18n/LocaleProvider";
import { Alert, Card, Input, Button, LoadingState } from "@/components/ui";

type SummaryResponse = {
  period: { from: string; to: string };
  receivables: {
    totalDebtCents: number;
    openInvoiceCount: number;
    clientsWithDebt: number;
    totalInvoicedCents: number;
    totalPaidOnInvoicesCents: number;
    overdue14Count: number;
    overdue14Cents: number;
  };
  register: {
    incomeCents: number;
    expenseCents: number;
    netCents: number;
    paymentCount: number;
    expenseCount: number;
  };
  openDebtInvoices: number;
  overdueDebtInvoices: number;
};

export default function FinanceReportsPage() {
  const t = useAppMessages();
  const p = t.finance.pages.reports;
  const c = t.finance.common;
  const [filterFrom, setFilterFrom] = useState(() =>
    format(new Date(new Date().getFullYear(), 0, 1), "yyyy-MM-dd")
  );
  const [filterTo, setFilterTo] = useState(() =>
    format(new Date(), "yyyy-MM-dd")
  );
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        from: `${filterFrom}T00:00:00.000Z`,
        to: `${filterTo}T23:59:59.999Z`,
      });
      const res = await fetch(`/api/administration/finance/summary?${params}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? c.loadFailed);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : c.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [filterFrom, filterTo, c.loadFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <FinancePageShell title={p.title}>
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Card className="mb-6 grid gap-3 p-4 sm:grid-cols-3">
        <Input
          label={p.registerFrom}
          type="date"
          value={filterFrom}
          onChange={(e) => setFilterFrom(e.target.value)}
        />
        <Input
          label={c.to}
          type="date"
          value={filterTo}
          onChange={(e) => setFilterTo(e.target.value)}
        />
        <div className="flex items-end">
          <Button variant="secondary" onClick={() => void load()}>
            {c.applyPeriod}
          </Button>
        </div>
      </Card>

      {loading ? (
        <LoadingState title={p.loading} />
      ) : data ? (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {p.receivablesSection}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label={p.totalOpenDebt}
                value={formatAdminMoney(data.receivables.totalDebtCents)}
                tone="danger"
              />
              <MetricCard
                label={p.invoicesWithBalance}
                value={String(data.receivables.openInvoiceCount)}
              />
              <MetricCard
                label={p.clientsWithDebt}
                value={String(data.receivables.clientsWithDebt)}
              />
              <MetricCard
                label={p.overdue14}
                value={`${data.receivables.overdue14Count} · ${formatAdminMoney(data.receivables.overdue14Cents)}`}
                tone="danger"
              />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <MetricCard
                label={p.totalInvoiced}
                value={formatAdminMoney(data.receivables.totalInvoicedCents)}
              />
              <MetricCard
                label={p.paidOnInvoices}
                value={formatAdminMoney(data.receivables.totalPaidOnInvoicesCents)}
                tone="success"
              />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {p.registerSection} ({filterFrom} → {filterTo})
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label={p.paymentsIncome}
                value={formatAdminMoney(data.register.incomeCents)}
                tone="success"
              />
              <MetricCard
                label={p.paymentLines}
                value={String(data.register.paymentCount)}
              />
              <MetricCard
                label={p.expenses}
                value={formatAdminMoney(data.register.expenseCents)}
              />
              <MetricCard
                label={p.netRegister}
                value={formatAdminMoney(data.register.netCents)}
              />
            </div>
          </section>
        </div>
      ) : null}
    </FinancePageShell>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger" | "success";
}) {
  const valueClass =
    tone === "danger"
      ? "text-red-700"
      : tone === "success"
        ? "text-emerald-700"
        : "text-zinc-900";
  return (
    <Card className="p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${valueClass}`}>{value}</p>
    </Card>
  );
}
