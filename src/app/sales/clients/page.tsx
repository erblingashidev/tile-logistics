"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { formatAdminMoney } from "@/components/administration/AdministrationLedgerTable";
import {
  PortalCard,
  PortalSectionTitle,
} from "@/components/portal/PortalShell";
import { useAppMessages } from "@/components/i18n/LocaleProvider";
import { callReasonLabel } from "@/lib/i18n/finance-labels";
import { Alert, Button, EmptyState, Input, LoadingState } from "@/components/ui";

type Tab = "all" | "debts" | "call";

type ReceivablesPayload = {
  clients: Array<{
    clientKey: string;
    displayName: string;
    balanceDueCents: number;
    invoiceCount: number;
    callReasons: string[];
    lastActivityAt: string | null;
  }>;
  openDebts: Array<{
    invoiceNumber: string;
    displayName: string;
    balanceDueCents: number;
    orderDate: string;
    salesAgentName: string;
  }>;
  callList: Array<{
    displayName: string;
    balanceDueCents: number;
    callReasons: string[];
    lastActivityAt: string | null;
  }>;
  summary: {
    totalDebtCents: number;
    openInvoiceCount: number;
    callListCount: number;
    clientCount: number;
  };
};

export default function SalesClientsPage() {
  const t = useAppMessages();
  const r = t.sales.receivables;
  const [tab, setTab] = useState<Tab>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<ReceivablesPayload | null>(null);
  const [requestText, setRequestText] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestOk, setRequestOk] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sales/receivables", { cache: "no-store" });
      const json = (await res.json()) as ReceivablesPayload & { error?: string };
      if (!res.ok) throw new Error(json.error ?? r.loading);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : r.loading);
    } finally {
      setLoading(false);
    }
  }, [r.loading]);

  useEffect(() => {
    void load();
  }, [load]);

  const tabFromUrl = useMemo(() => {
    if (typeof window === "undefined") return null;
    const v = new URLSearchParams(window.location.search).get("tab");
    if (v === "debts" || v === "call" || v === "all") return v;
    return null;
  }, []);

  useEffect(() => {
    if (tabFromUrl) setTab(tabFromUrl);
  }, [tabFromUrl]);

  async function sendRequest() {
    setRequestBusy(true);
    setRequestOk(false);
    try {
      const res = await fetch("/api/sales/management-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: requestText }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? r.requestFailed);
      setRequestOk(true);
      setRequestText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : r.requestFailed);
    } finally {
      setRequestBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PortalSectionTitle>{r.title}</PortalSectionTitle>
      <Alert tone="info">{r.readOnly}</Alert>

      <PortalCard className="space-y-3 p-4">
        <p className="text-sm font-medium text-zinc-800">{r.askManagement}</p>
        <Input
          placeholder={r.requestPlaceholder}
          value={requestText}
          onChange={(e) => setRequestText(e.target.value)}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={requestBusy || requestText.trim().length < 3}
          onClick={() => void sendRequest()}
        >
          {requestBusy ? t.common.loading : r.askManagement}
        </Button>
        {requestOk ? (
          <p className="text-sm text-emerald-700">{r.requestSent}</p>
        ) : null}
      </PortalCard>

      <div className="flex flex-wrap gap-2">
        {(["all", "debts", "call"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              tab === key
                ? "bg-zinc-900 text-white"
                : "bg-white text-zinc-700 ring-1 ring-zinc-200"
            }`}
          >
            {r.tabs[key]}
          </button>
        ))}
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {loading ? (
        <LoadingState title={r.loading} />
      ) : data ? (
        <>
          <PortalCard className="grid gap-3 p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-zinc-500">{r.totalDue}</p>
              <p className="text-lg font-semibold text-red-700">
                {formatAdminMoney(data.summary.totalDebtCents)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">{r.openInvoices}</p>
              <p className="text-lg font-semibold">{data.summary.openInvoiceCount}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">{r.toCall}</p>
              <p className="text-lg font-semibold">{data.summary.callListCount}</p>
            </div>
          </PortalCard>

          {tab === "all" ? (
            data.clients.length === 0 ? (
              <EmptyState title={r.noClients} />
            ) : (
              <PortalCard className="overflow-x-auto p-0">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">{r.client}</th>
                      <th className="px-3 py-2">{r.due}</th>
                      <th className="px-3 py-2">{r.openInvoices}</th>
                      <th className="px-3 py-2">{r.lastActivity}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.clients.map((c) => (
                      <tr key={c.clientKey} className="border-t">
                        <td className="px-3 py-2 font-medium">{c.displayName}</td>
                        <td className="px-3 py-2">
                          {formatAdminMoney(c.balanceDueCents)}
                        </td>
                        <td className="px-3 py-2">{c.invoiceCount}</td>
                        <td className="px-3 py-2 text-xs text-zinc-600">
                          {c.lastActivityAt
                            ? format(new Date(c.lastActivityAt), "d MMM yyyy")
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </PortalCard>
            )
          ) : null}

          {tab === "debts" ? (
            data.openDebts.length === 0 ? (
              <EmptyState title={r.noDebts} />
            ) : (
              <PortalCard className="overflow-x-auto p-0">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">{r.invoice}</th>
                      <th className="px-3 py-2">{r.client}</th>
                      <th className="px-3 py-2">{r.due}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.openDebts.map((row) => (
                      <tr key={row.invoiceNumber} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">
                          {row.invoiceNumber}
                        </td>
                        <td className="px-3 py-2">{row.displayName}</td>
                        <td className="px-3 py-2 font-medium text-red-700">
                          {formatAdminMoney(row.balanceDueCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </PortalCard>
            )
          ) : null}

          {tab === "call" ? (
            data.callList.length === 0 ? (
              <EmptyState title={r.noCallList} />
            ) : (
              <PortalCard className="overflow-x-auto p-0">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">{r.client}</th>
                      <th className="px-3 py-2">{r.due}</th>
                      <th className="px-3 py-2">{r.whyCall}</th>
                      <th className="px-3 py-2">{r.lastActivity}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.callList.map((c) => (
                      <tr key={c.displayName} className="border-t">
                        <td className="px-3 py-2 font-medium">{c.displayName}</td>
                        <td className="px-3 py-2">
                          {formatAdminMoney(c.balanceDueCents)}
                        </td>
                        <td className="px-3 py-2 text-xs text-zinc-600">
                          {c.callReasons
                            .map((reason) => callReasonLabel(t, reason))
                            .join(" · ")}
                        </td>
                        <td className="px-3 py-2 text-xs text-zinc-600">
                          {c.lastActivityAt
                            ? format(new Date(c.lastActivityAt), "d MMM yyyy")
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </PortalCard>
            )
          ) : null}
        </>
      ) : null}
    </div>
  );
}
