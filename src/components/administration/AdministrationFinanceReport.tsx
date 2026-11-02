"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import {
  ADMIN_PAYMENT_METHODS,
  ADMIN_TRANSACTION_KINDS,
} from "@/lib/administration/constants";
import {
  AdministrationLedgerTable,
  formatAdminMoney,
  type AdministrationTransaction,
} from "@/components/administration/AdministrationLedgerTable";
import {
  ClosedRegisterSessionsTable,
  type ClosedRegisterSession,
} from "@/components/administration/RegisterShiftReconciliation";
import { Alert, Button, Card, Input, PageSection, Select } from "@/components/ui";

type EditRequest = {
  id: number;
  transactionId: number;
  reason: string;
  createdAt: string;
};

export function AdministrationFinanceReport({
  defaultDateFrom,
  defaultDateTo,
}: {
  defaultDateFrom?: string;
  defaultDateTo?: string;
}) {
  const [filterFrom, setFilterFrom] = useState(
    defaultDateFrom ?? format(new Date(), "yyyy-MM-dd")
  );
  const [filterTo, setFilterTo] = useState(
    defaultDateTo ?? format(new Date(), "yyyy-MM-dd")
  );
  const [filterPayment, setFilterPayment] = useState("");
  const [filterKind, setFilterKind] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [transactions, setTransactions] = useState<AdministrationTransaction[]>(
    []
  );
  const [reportSummary, setReportSummary] = useState<{
    grandTotalCents: number;
    rows: Array<{
      paymentMethod: string | null;
      kind: string;
      totalCents: number;
      count: number;
    }>;
  } | null>(null);
  const [pendingRequests, setPendingRequests] = useState<EditRequest[]>([]);
  const [closedSessions, setClosedSessions] = useState<ClosedRegisterSession[]>(
    []
  );
  const [canApprove, setCanApprove] = useState(false);
  const [canReports, setCanReports] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (defaultDateFrom) setFilterFrom(defaultDateFrom);
    if (defaultDateTo) setFilterTo(defaultDateTo);
  }, [defaultDateFrom, defaultDateTo]);

  const loadPermissions = useCallback(async () => {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const perms: string[] = data?.permissions ?? [];
    setCanApprove(
      perms.includes("administration:approve") || data?.user?.role === "admin"
    );
    setCanReports(
      perms.includes("administration:reports") ||
        perms.includes("administration:approve") ||
        data?.user?.role === "admin"
    );
  }, []);

  const loadTransactions = useCallback(async () => {
    const params = new URLSearchParams({
      from: `${filterFrom}T00:00:00.000Z`,
      to: `${filterTo}T23:59:59.999Z`,
    });
    if (filterPayment) params.set("paymentMethod", filterPayment);
    if (filterKind) params.set("kind", filterKind);
    if (filterSearch.trim()) params.set("search", filterSearch.trim());
    const res = await fetch(`/api/administration/transactions?${params}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Could not load register entries");
    const data = await res.json();
    setTransactions(data.transactions ?? []);
  }, [filterFrom, filterTo, filterPayment, filterKind, filterSearch]);

  const loadClosedSessions = useCallback(async () => {
    const params = new URLSearchParams({
      from: `${filterFrom}T00:00:00.000Z`,
      to: `${filterTo}T23:59:59.999Z`,
    });
    const res = await fetch(`/api/administration/register?${params}`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = await res.json();
    setClosedSessions(data.sessions ?? []);
  }, [filterFrom, filterTo]);

  const loadPending = useCallback(async () => {
    const res = await fetch("/api/administration/edit-requests", {
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = await res.json();
    setPendingRequests(data.requests ?? []);
  }, []);

  const refresh = useCallback(async () => {
    setError("");
    try {
      await Promise.all([
        loadTransactions(),
        loadPending(),
        loadClosedSessions(),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }, [loadTransactions, loadPending, loadClosedSessions]);

  useEffect(() => {
    void loadPermissions();
  }, [loadPermissions]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runReport() {
    if (!canReports) return;
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({
        from: `${filterFrom}T00:00:00.000Z`,
        to: `${filterTo}T23:59:59.999Z`,
      });
      const res = await fetch(`/api/administration/reports?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Report failed");
      setReportSummary(data);
      await loadClosedSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report failed");
    } finally {
      setBusy(false);
    }
  }

  async function reviewRequest(id: number, decision: "approve" | "reject") {
    setBusy(true);
    try {
      const res = await fetch(`/api/administration/edit-requests/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageSection title="Administration & cash register">
      <p className="-mt-2 mb-4 text-sm text-zinc-600">
        Payments, expenses, and ledger lines — edit open entries or request
        management approval when locked.
      </p>
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-4">
        <div className="sm:col-span-4">
          <Input
            label="Search register"
            placeholder="Customer name, invoice #, purpose, notes…"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
          />
        </div>
        <Input
          label="From"
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
        <Select
          label="Payment"
          value={filterPayment}
          onChange={(e) => setFilterPayment(e.target.value)}
        >
          <option value="">All</option>
          {ADMIN_PAYMENT_METHODS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </Select>
        <Select
          label="Kind"
          value={filterKind}
          onChange={(e) => setFilterKind(e.target.value)}
        >
          <option value="">All</option>
          {ADMIN_TRANSACTION_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </Select>
        <div className="flex flex-wrap items-end gap-2 sm:col-span-4">
          <Button variant="secondary" disabled={busy} onClick={() => void refresh()}>
            Apply filters
          </Button>
          {canReports ? (
            <Button variant="secondary" disabled={busy} onClick={() => void runReport()}>
              Generate summary
            </Button>
          ) : null}
        </div>
      </Card>

      <Card className="mb-4 p-4">
        <p className="mb-2 font-medium">End-of-day cash register</p>
        <p className="mb-3 text-sm text-zinc-600">
          After each shift close: green = balanced, amber = over (+), red =
          short (−).
        </p>
        <ClosedRegisterSessionsTable sessions={closedSessions} />
      </Card>

      {reportSummary ? (
        <Card className="mb-4 p-4">
          <p className="mb-2 font-medium">Payment summary</p>
          <p className="text-sm text-zinc-600">
            Net total: {formatAdminMoney(reportSummary.grandTotalCents)}
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {reportSummary.rows.map((r, i) => (
              <li key={i}>
                {r.kind} / {r.paymentMethod ?? "—"}:{" "}
                {formatAdminMoney(Number(r.totalCents))} ({r.count} lines)
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <AdministrationLedgerTable
        transactions={transactions}
        canApprove={canApprove}
        busy={busy}
        onBusyChange={setBusy}
        onError={setError}
        onUpdated={refresh}
      />

      {canApprove && pendingRequests.length > 0 ? (
        <Card className="mt-6 divide-y">
          <div className="border-b border-zinc-200 px-4 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Pending edit requests
          </div>
          {pendingRequests.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 p-4"
            >
              <div>
                <p className="font-medium">Transaction #{r.transactionId}</p>
                <p className="text-sm text-zinc-600">{r.reason}</p>
                <p className="text-xs text-zinc-400">
                  {format(new Date(r.createdAt), "PPp")}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => void reviewRequest(r.id, "approve")}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void reviewRequest(r.id, "reject")}
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </Card>
      ) : null}
    </PageSection>
  );
}
