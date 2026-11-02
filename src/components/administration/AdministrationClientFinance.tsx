"use client";

import { useCallback, useEffect, useState } from "react";
import { formatAdminMoney } from "@/components/administration/AdministrationLedgerTable";
import { Button, Card, EmptyState, LoadingState } from "@/components/ui";
import { format } from "date-fns";

export type ClientFinanceProfile = {
  clientKey: string;
  displayName: string;
  totalInvoicedCents: number;
  totalPaidCents: number;
  balanceDueCents: number;
  unpaidOnAccountCents: number;
  invoiceCount: number;
  paymentCount: number;
  lastActivityAt: string | null;
  callReasons: string[];
  invoices: Array<{
    invoiceNumber: string;
    orderId: number | null;
    orderDate: string | null;
    orderStatus: string | null;
    location: string | null;
    invoicedCents: number;
    paidCents: number;
    balanceDueCents: number;
    salesEmployeeId: number | null;
    salesAgentName: string | null;
    daysOutstanding: number;
  }>;
  registerLines: Array<{
    id: number;
    recordedAt: string;
    kind: string;
    paymentMethod: string | null;
    amountCents: number;
    invoiceReference: string | null;
    purpose: string | null;
  }>;
  paymentMethodTotals: Array<{
    paymentMethod: string | null;
    totalCents: number;
    count: number;
  }>;
};

function methodLabel(id: string | null) {
  if (!id) return "—";
  return id.replace(/_/g, " ");
}

function ClientReportCard({
  profile,
  onClose,
}: {
  profile: ClientFinanceProfile;
  onClose: () => void;
}) {
  const timeline = [
    ...profile.invoices.map((inv) => ({
      sortAt: inv.orderDate ?? "",
      type: "order" as const,
      label: `Order ${inv.invoiceNumber}`,
      detail: `${inv.orderStatus ?? "—"} · ${inv.location ?? "—"}`,
      amountCents: inv.invoicedCents,
      extra: inv.balanceDueCents > 0 ? `Due ${formatAdminMoney(inv.balanceDueCents)}` : "Paid",
    })),
    ...profile.registerLines.map((line) => ({
      sortAt: line.recordedAt,
      type: "register" as const,
      label: `${line.kind.replace(/_/g, " ")}${line.invoiceReference ? ` · ${line.invoiceReference}` : ""}`,
      detail: [methodLabel(line.paymentMethod), line.purpose].filter(Boolean).join(" · "),
      amountCents: line.amountCents,
      extra: "",
    })),
  ].sort((a, b) => b.sortAt.localeCompare(a.sortAt));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 print:relative print:inset-auto print:bg-white print:p-0">
      <Card className="my-4 w-full max-w-3xl p-6 print:my-0 print:max-w-none print:shadow-none">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 print:hidden">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Client report
            </p>
            <h3 className="text-xl font-semibold text-zinc-900">
              {profile.displayName}
            </h3>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => window.print()}>
              Print
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-zinc-200 p-3">
            <p className="text-xs text-zinc-500">Invoiced</p>
            <p className="text-lg font-semibold">
              {formatAdminMoney(profile.totalInvoicedCents)}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-3">
            <p className="text-xs text-zinc-500">Paid (register)</p>
            <p className="text-lg font-semibold text-emerald-700">
              {formatAdminMoney(profile.totalPaidCents)}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-3">
            <p className="text-xs text-zinc-500">Balance due</p>
            <p className="text-lg font-semibold text-red-700">
              {formatAdminMoney(profile.balanceDueCents)}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-3">
            <p className="text-xs text-zinc-500">On account (unpaid)</p>
            <p className="text-lg font-semibold">
              {formatAdminMoney(profile.unpaidOnAccountCents)}
            </p>
          </div>
        </div>

        {profile.paymentMethodTotals.length > 0 ? (
          <div className="mb-6">
            <p className="mb-2 text-sm font-medium text-zinc-900">
              Payments by method
            </p>
            <ul className="flex flex-wrap gap-3 text-sm text-zinc-600">
              {profile.paymentMethodTotals.map((row) => (
                <li key={row.paymentMethod ?? "none"}>
                  <span className="capitalize">{methodLabel(row.paymentMethod)}</span>:{" "}
                  <span className="font-medium text-zinc-800">
                    {formatAdminMoney(row.totalCents)}
                  </span>{" "}
                  ({row.count})
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="mb-2 text-sm font-medium text-zinc-900">Invoices</p>
        <div className="mb-6 overflow-x-auto rounded-lg border border-zinc-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2">Invoice</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Agent</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Age</th>
                <th className="px-3 py-2">Invoiced</th>
                <th className="px-3 py-2">Paid</th>
                <th className="px-3 py-2">Due</th>
              </tr>
            </thead>
            <tbody>
              {profile.invoices.map((inv) => (
                <tr key={inv.invoiceNumber} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{inv.invoiceNumber}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {inv.orderDate ? format(new Date(inv.orderDate), "d MMM yyyy") : "—"}
                  </td>
                  <td className="px-3 py-2">{inv.salesAgentName ?? "—"}</td>
                  <td className="px-3 py-2">{inv.orderStatus ?? "—"}</td>
                  <td className="px-3 py-2">{inv.daysOutstanding}d</td>
                  <td className="px-3 py-2">{formatAdminMoney(inv.invoicedCents)}</td>
                  <td className="px-3 py-2">{formatAdminMoney(inv.paidCents)}</td>
                  <td className="px-3 py-2 font-medium">
                    {formatAdminMoney(inv.balanceDueCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mb-2 text-sm font-medium text-zinc-900">Activity timeline</p>
        <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
          {timeline.map((item, i) => (
            <li
              key={`${item.type}-${i}`}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded border border-zinc-100 px-3 py-2"
            >
              <div>
                <p className="font-medium text-zinc-800">{item.label}</p>
                <p className="text-xs text-zinc-500">{item.detail}</p>
              </div>
              <div className="text-right">
                <p className="font-medium">{formatAdminMoney(item.amountCents)}</p>
                {item.extra ? (
                  <p className="text-xs text-red-600">{item.extra}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function ClientRow({
  profile,
  onOpen,
}: {
  profile: ClientFinanceProfile;
  onOpen: (key: string) => void;
}) {
  return (
    <tr className="border-t border-zinc-100 hover:bg-zinc-50/80">
      <td className="px-3 py-2 font-medium text-zinc-900">{profile.displayName}</td>
      <td className="px-3 py-2">{formatAdminMoney(profile.balanceDueCents)}</td>
      <td className="px-3 py-2">{profile.invoiceCount}</td>
      <td className="px-3 py-2 max-w-xs text-xs text-zinc-600">
        {profile.callReasons.join(" · ") || "—"}
      </td>
      <td className="px-3 py-2 text-right">
        <Button size="sm" variant="secondary" onClick={() => onOpen(profile.clientKey)}>
          Client card
        </Button>
      </td>
    </tr>
  );
}

type OverdueDebtItem = {
  clientKey: string;
  displayName: string;
  invoiceNumber: string;
  balanceDueCents: number;
  daysOutstanding: number;
  salesAgentName: string;
  orderDate: string;
  location: string | null;
};

type AgentDebtGroup = {
  salesAgentName: string;
  overdueDueCents: number;
  clientCount: number;
  items: OverdueDebtItem[];
};

export function AdministrationClientFinance() {
  const [loading, setLoading] = useState(true);
  const [debts, setDebts] = useState<ClientFinanceProfile[]>([]);
  const [callList, setCallList] = useState<ClientFinanceProfile[]>([]);
  const [overdueByAgent, setOverdueByAgent] = useState<AgentDebtGroup[]>([]);
  const [overdueFlat, setOverdueFlat] = useState<OverdueDebtItem[]>([]);
  const [agentFilter, setAgentFilter] = useState("");
  const [selected, setSelected] = useState<ClientFinanceProfile | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        "/api/administration/clients?overdueDays=14",
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load clients");
      setDebts(data.debts ?? []);
      setCallList(data.callList ?? []);
      setOverdueByAgent(data.overdueByAgent ?? []);
      setOverdueFlat(data.overdueDebts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const openClient = useCallback(async (clientKey: string) => {
    setError("");
    const res = await fetch(
      `/api/administration/clients?clientKey=${encodeURIComponent(clientKey)}`,
      { cache: "no-store" }
    );
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not load client");
      return;
    }
    setSelected(data.profile);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredOverdue = agentFilter
    ? overdueFlat.filter((i) => i.salesAgentName === agentFilter)
    : overdueFlat;

  const agentOptions = [...new Set(overdueFlat.map((i) => i.salesAgentName))].sort();

  if (loading) {
    return <LoadingState title="Loading client balances…" />;
  }

  return (
    <div className="space-y-8">
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : null}

      <section>
        <h3 className="mb-2 text-sm font-semibold text-red-800">
          Unpaid over 14 days
        </h3>
        <p className="mb-3 text-sm text-zinc-600">
          Invoices still owing balance where the order date is at least two weeks
          ago. Grouped by the sales agent on the order.
        </p>
        {overdueByAgent.length === 0 ? (
          <Card>
            <EmptyState title="No debts overdue beyond 14 days." />
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {overdueByAgent.map((group) => (
                <Card key={group.salesAgentName} className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Sales agent
                  </p>
                  <p className="mt-1 font-semibold text-zinc-900">
                    {group.salesAgentName}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-red-700">
                    {formatAdminMoney(group.overdueDueCents)}
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
                    View lines
                  </Button>
                </Card>
              ))}
            </div>
            <Card className="overflow-x-auto p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
                <p className="text-sm font-medium text-zinc-900">Overdue lines</p>
                {agentFilter ? (
                  <Button size="sm" variant="ghost" onClick={() => setAgentFilter("")}>
                    Clear filter ({agentFilter})
                  </Button>
                ) : (
                  <select
                    className="rounded border border-zinc-300 px-2 py-1 text-sm"
                    value={agentFilter}
                    onChange={(e) => setAgentFilter(e.target.value)}
                  >
                    <option value="">All agents</option>
                    {agentOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <table className="min-w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">Agent</th>
                    <th className="px-3 py-2">Client</th>
                    <th className="px-3 py-2">Invoice</th>
                    <th className="px-3 py-2">Order date</th>
                    <th className="px-3 py-2">Days</th>
                    <th className="px-3 py-2">Due</th>
                    <th className="px-3 py-2 text-right">Report</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOverdue.map((row) => (
                    <tr key={`${row.invoiceNumber}-${row.clientKey}`} className="border-t">
                      <td className="px-3 py-2">{row.salesAgentName}</td>
                      <td className="px-3 py-2 font-medium">{row.displayName}</td>
                      <td className="px-3 py-2 font-mono text-xs">{row.invoiceNumber}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {format(new Date(row.orderDate), "d MMM yyyy")}
                      </td>
                      <td className="px-3 py-2">{row.daysOutstanding}</td>
                      <td className="px-3 py-2 font-medium text-red-700">
                        {formatAdminMoney(row.balanceDueCents)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void openClient(row.clientKey)}
                        >
                          Client card
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-zinc-900">Debts</h3>
        <p className="mb-3 text-sm text-zinc-600">
          Clients with invoice balance still due (order total minus register payments
          matched by invoice).
        </p>
        <Card className="overflow-x-auto">
          {debts.length === 0 ? (
            <EmptyState title="No outstanding client debts." />
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
                {debts.map((p) => (
                  <ClientRow key={p.clientKey} profile={p} onOpen={openClient} />
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-zinc-900">To call list</h3>
        <p className="mb-3 text-sm text-zinc-600">
          Follow up on unpaid balances, on-account register lines, or delivered orders
          not fully paid.
        </p>
        <Card className="overflow-x-auto">
          {callList.length === 0 ? (
            <EmptyState title="Nobody on the call list right now." />
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
                {callList.map((p) => (
                  <ClientRow key={p.clientKey} profile={p} onOpen={openClient} />
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>

      {selected ? (
        <ClientReportCard profile={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}
