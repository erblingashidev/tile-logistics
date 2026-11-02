"use client";

import { formatAdminMoney } from "@/components/administration/AdministrationLedgerTable";
import { Card } from "@/components/ui";

export type FinanceOverviewData = {
  incomeCents: number;
  expenseCents: number;
  refundCents: number;
  netCents: number;
  paymentCount: number;
  expenseCount: number;
  cashDrawerCents: number | null;
  registerOpen: boolean;
  byPaymentMethod: Array<{
    paymentMethod: string | null;
    totalCents: number;
    count: number;
  }>;
};

function methodLabel(id: string | null) {
  if (!id) return "—";
  return id.replace(/_/g, " ");
}

export function AdministrationFinanceOverview({
  overview,
  periodLabel,
}: {
  overview: FinanceOverviewData | null;
  periodLabel: string;
}) {
  if (!overview) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">{periodLabel}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Income
          </p>
          <p className="mt-1 text-xl font-semibold text-emerald-700">
            {formatAdminMoney(overview.incomeCents)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {overview.paymentCount} payment(s)
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Expenses
          </p>
          <p className="mt-1 text-xl font-semibold text-red-700">
            {formatAdminMoney(overview.expenseCents)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {overview.expenseCount} payout(s)
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Net (period)
          </p>
          <p className="mt-1 text-xl font-semibold text-zinc-900">
            {formatAdminMoney(overview.netCents)}
          </p>
          {overview.refundCents > 0 ? (
            <p className="mt-1 text-xs text-zinc-500">
              Refunds {formatAdminMoney(overview.refundCents)}
            </p>
          ) : null}
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Cash in drawer
          </p>
          <p className="mt-1 text-xl font-semibold text-zinc-900">
            {overview.registerOpen && overview.cashDrawerCents != null
              ? formatAdminMoney(overview.cashDrawerCents)
              : "—"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {overview.registerOpen ? "Register open" : "No open shift"}
          </p>
        </Card>
      </div>

      {overview.byPaymentMethod.length > 0 ? (
        <Card className="p-4">
          <p className="mb-2 text-sm font-medium text-zinc-900">
            By payment method
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600">
            {overview.byPaymentMethod.map((row) => (
              <li key={row.paymentMethod ?? "none"}>
                <span className="capitalize">{methodLabel(row.paymentMethod)}</span>
                {": "}
                <span className="font-medium text-zinc-800">
                  {formatAdminMoney(row.totalCents)}
                </span>
                <span className="text-zinc-400"> ({row.count})</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
