"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { formatAdminMoney } from "@/components/administration/AdministrationLedgerTable";
import { FinancePageShell } from "@/components/administration/finance/FinancePageShell";
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
      if (!res.ok) throw new Error(json.error ?? "Load failed");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [filterFrom, filterTo]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <FinancePageShell
      title="Finance reports"
      description="Totals for register activity and open receivables. Future Excel imports from your finance app will feed the same views."
    >
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Card className="mb-6 grid gap-3 p-4 sm:grid-cols-3">
        <Input
          label="Register activity from"
          type="date"
          value={filterFrom}
          onChange={(e) => setFilterFrom(e.target.value)}
        />
        <Input
          label="To"
          type="date"
          value={filterTo}
          onChange={(e) => setFilterTo(e.target.value)}
        />
        <div className="flex items-end">
          <Button variant="secondary" onClick={() => void load()}>
            Apply period
          </Button>
        </div>
      </Card>

      {loading ? (
        <LoadingState title="Loading reports…" />
      ) : data ? (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Receivables (orders + register)
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Total open debt"
                value={formatAdminMoney(data.receivables.totalDebtCents)}
                tone="danger"
              />
              <MetricCard
                label="Invoices with balance open"
                value={String(data.receivables.openInvoiceCount)}
              />
              <MetricCard
                label="Clients with debt"
                value={String(data.receivables.clientsWithDebt)}
              />
              <MetricCard
                label="Overdue 14+ days"
                value={`${data.receivables.overdue14Count} · ${formatAdminMoney(data.receivables.overdue14Cents)}`}
                tone="danger"
              />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <MetricCard
                label="Total invoiced (orders)"
                value={formatAdminMoney(data.receivables.totalInvoicedCents)}
              />
              <MetricCard
                label="Paid on invoices (register)"
                value={formatAdminMoney(data.receivables.totalPaidOnInvoicesCents)}
                tone="success"
              />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Cash register ({filterFrom} → {filterTo})
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Payments (income)"
                value={formatAdminMoney(data.register.incomeCents)}
                tone="success"
              />
              <MetricCard
                label="Payment lines"
                value={String(data.register.paymentCount)}
              />
              <MetricCard
                label="Expenses"
                value={formatAdminMoney(data.register.expenseCents)}
              />
              <MetricCard
                label="Net (income − expenses − refunds)"
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
