"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import {
  ADMIN_PAYMENT_METHODS,
  ADMIN_TRANSACTION_KINDS,
} from "@/lib/administration/constants";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Input,
  PageSection,
  Select,
} from "@/components/ui";
import { format } from "date-fns";

type RegisterSession = {
  id: number;
  status: string;
  openedAt: string;
  openingFloatCents: number;
  closingCashCountedCents?: number | null;
};

type Transaction = {
  id: number;
  kind: string;
  paymentMethod: string | null;
  amountCents: number;
  counterpartyName: string | null;
  purpose: string | null;
  expenseCategory: string | null;
  invoiceReference: string | null;
  recordedAt: string;
  locked: boolean;
};

type EditRequest = {
  id: number;
  transactionId: number;
  reason: string;
  proposedChangesJson: string;
  createdAt: string;
};

function formatMoney(cents: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function todayRange() {
  const d = format(new Date(), "yyyy-MM-dd");
  return { from: `${d}T00:00:00.000Z`, to: `${d}T23:59:59.999Z` };
}

export default function AdministrationPage() {
  const [registerSession, setRegisterSession] =
    useState<RegisterSession | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pendingRequests, setPendingRequests] = useState<EditRequest[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [canApprove, setCanApprove] = useState(false);
  const [canReports, setCanReports] = useState(false);

  const [openingFloat, setOpeningFloat] = useState("0");
  const [closingCounted, setClosingCounted] = useState("");
  const [closingNotes, setClosingNotes] = useState("");

  const [filterFrom, setFilterFrom] = useState(() =>
    format(new Date(), "yyyy-MM-dd")
  );
  const [filterTo, setFilterTo] = useState(() =>
    format(new Date(), "yyyy-MM-dd")
  );
  const [filterPayment, setFilterPayment] = useState("");
  const [filterKind, setFilterKind] = useState("");

  const [formKind, setFormKind] = useState("payment");
  const [formPayment, setFormPayment] = useState("cash");
  const [formAmount, setFormAmount] = useState("");
  const [formCounterparty, setFormCounterparty] = useState("");
  const [formPurpose, setFormPurpose] = useState("");
  const [formExpenseCategory, setFormExpenseCategory] = useState("");
  const [formInvoiceRef, setFormInvoiceRef] = useState("");

  const [editTxId, setEditTxId] = useState<number | null>(null);
  const [editReason, setEditReason] = useState("");
  const [editAmount, setEditAmount] = useState("");

  const [reportSummary, setReportSummary] = useState<{
    grandTotalCents: number;
    rows: Array<{
      paymentMethod: string | null;
      kind: string;
      totalCents: number;
      count: number;
    }>;
  } | null>(null);

  const loadRegister = useCallback(async () => {
    const res = await fetch("/api/administration/register", {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Could not load register");
    const data = await res.json();
    setRegisterSession(data.session ?? null);
  }, []);

  const loadTransactions = useCallback(async () => {
    const params = new URLSearchParams({
      from: `${filterFrom}T00:00:00.000Z`,
      to: `${filterTo}T23:59:59.999Z`,
    });
    if (filterPayment) params.set("paymentMethod", filterPayment);
    if (filterKind) params.set("kind", filterKind);
    const res = await fetch(`/api/administration/transactions?${params}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Could not load transactions");
    const data = await res.json();
    setTransactions(data.transactions ?? []);
  }, [filterFrom, filterTo, filterPayment, filterKind]);

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
      await Promise.all([loadRegister(), loadTransactions(), loadPending()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }, [loadRegister, loadTransactions, loadPending]);

  useEffect(() => {
    void refresh();
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const perms: string[] = data?.permissions ?? [];
        setCanApprove(
          perms.includes("administration:approve") || data?.user?.role === "admin"
        );
        setCanReports(
          perms.includes("administration:reports") ||
            perms.includes("administration:approve") ||
            data?.user?.role === "admin"
        );
      })
      .catch(() => {});
  }, [refresh]);

  const registerOpen = registerSession?.status === "open";

  const dayTotals = useMemo(() => {
    const range = todayRange();
    return transactions
      .filter(
        (t) =>
          t.recordedAt >= range.from &&
          t.recordedAt <= range.to &&
          t.kind === "payment"
      )
      .reduce((s, t) => s + t.amountCents, 0);
  }, [transactions]);

  async function openRegister() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/administration/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "open",
          openingFloatCents: Math.round(parseFloat(openingFloat || "0") * 100),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setRegisterSession(data.session);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function closeRegister() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/administration/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "close",
          closingCashCountedCents: Math.round(
            parseFloat(closingCounted || "0") * 100
          ),
          closingNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setRegisterSession(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitTransaction(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/administration/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: formKind,
          paymentMethod:
            formKind === "expense" ? null : formPayment || "cash",
          amountCents: Math.round(parseFloat(formAmount || "0") * 100),
          counterpartyName: formCounterparty,
          purpose: formPurpose,
          expenseCategory:
            formKind === "expense" ? formExpenseCategory : undefined,
          invoiceReference: formInvoiceRef || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setFormAmount("");
      setFormPurpose("");
      setFormCounterparty("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitEditRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!editTxId) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/administration/edit-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: editTxId,
          reason: editReason,
          proposedChanges: {
            amountCents: Math.round(parseFloat(editAmount || "0") * 100),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setEditTxId(null);
      setEditReason("");
      setEditAmount("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
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

  async function runReport() {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title="Administration"
      description="Cash register, payments, expenses, and management oversight. Shifts lock entries; corrections need management approval."
      contentMaxWidth="wide"
    >
      {error ? (
        <Alert tone="error">
          {error}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <PageSection title="Cash register shift">
          <Card className="space-y-4 p-4">
            {registerOpen && registerSession ? (
              <>
                <p className="text-sm text-zinc-600">
                  Open since{" "}
                  {format(new Date(registerSession.openedAt), "PPp")}. Opening
                  float: {formatMoney(registerSession.openingFloatCents)}.
                </p>
                <p className="text-sm font-medium text-emerald-700">
                  Register is open — record all payments and expenses before
                  closing.
                </p>
                <Input
                  label="Counted cash in drawer (€)"
                  value={closingCounted}
                  onChange={(e) => setClosingCounted(e.target.value)}
                  inputMode="decimal"
                />
                <Input
                  label="Closing notes"
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                />
                <Button disabled={busy} onClick={() => void closeRegister()}>
                  Close register & lock entries
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-zinc-600">
                  Open a shift before cashiers can post transactions. Closing
                  locks the shift for audit.
                </p>
                <Input
                  label="Opening float / cash in drawer (€)"
                  value={openingFloat}
                  onChange={(e) => setOpeningFloat(e.target.value)}
                  inputMode="decimal"
                />
                <Button disabled={busy} onClick={() => void openRegister()}>
                  Open register
                </Button>
              </>
            )}
            <p className="text-xs text-zinc-500">
              Today&apos;s recorded payments (filter list):{" "}
              {formatMoney(dayTotals)}
            </p>
          </Card>
        </PageSection>

        <PageSection title="Record transaction">
          <Card className="p-4">
            <form className="space-y-3" onSubmit={submitTransaction}>
              <Select
                label="Type"
                value={formKind}
                onChange={(e) => setFormKind(e.target.value)}
              >
                {ADMIN_TRANSACTION_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </Select>
              {formKind !== "expense" ? (
                <Select
                  label="Payment method"
                  value={formPayment}
                  onChange={(e) => setFormPayment(e.target.value)}
                >
                  {ADMIN_PAYMENT_METHODS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              ) : null}
              <Input
                label="Amount (€)"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                inputMode="decimal"
                required
              />
              <Input
                label={
                  formKind === "expense" ? "Paid to (person / vendor)" : "Customer / payer"
                }
                value={formCounterparty}
                onChange={(e) => setFormCounterparty(e.target.value)}
              />
              <Input
                label="Purpose / description"
                value={formPurpose}
                onChange={(e) => setFormPurpose(e.target.value)}
              />
              {formKind === "expense" ? (
                <Input
                  label="Expense category"
                  value={formExpenseCategory}
                  onChange={(e) => setFormExpenseCategory(e.target.value)}
                />
              ) : null}
              <Input
                label="Invoice / receipt reference"
                value={formInvoiceRef}
                onChange={(e) => setFormInvoiceRef(e.target.value)}
              />
              <Button type="submit" disabled={busy}>
                Save entry
              </Button>
              {!registerOpen ? (
                <p className="text-xs text-amber-700">
                  Cashiers must open the register first; management can still post
                  outside a shift when needed.
                </p>
              ) : null}
            </form>
          </Card>
        </PageSection>
      </div>

      <PageSection title="Ledger & filters" className="mt-8">
        <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-4">
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
                Generate report
              </Button>
            ) : null}
          </div>
        </Card>

        {reportSummary ? (
          <Card className="mb-4 p-4">
            <p className="mb-2 font-medium">Report summary</p>
            <p className="text-sm text-zinc-600">
              Net total: {formatMoney(reportSummary.grandTotalCents)}
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {reportSummary.rows.map((r, i) => (
                <li key={i}>
                  {r.kind} / {r.paymentMethod ?? "—"}: {formatMoney(Number(r.totalCents))}{" "}
                  ({r.count} lines)
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {transactions.length === 0 ? (
          <EmptyState title="No transactions in this range" />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Kind</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Party</th>
                  <th className="px-3 py-2">Purpose</th>
                  <th className="px-3 py-2">Locked</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-b last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {format(new Date(t.recordedAt), "PPp")}
                    </td>
                    <td className="px-3 py-2">{t.kind}</td>
                    <td className="px-3 py-2">{t.paymentMethod ?? "—"}</td>
                    <td className="px-3 py-2 font-medium">{formatMoney(t.amountCents)}</td>
                    <td className="px-3 py-2">{t.counterpartyName ?? "—"}</td>
                    <td className="px-3 py-2 max-w-xs truncate">{t.purpose ?? "—"}</td>
                    <td className="px-3 py-2">{t.locked ? "Yes" : "No"}</td>
                    <td className="px-3 py-2">
                      {t.locked ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditTxId(t.id);
                            setEditAmount(String(Math.abs(t.amountCents) / 100));
                          }}
                        >
                          Request fix
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageSection>

      {editTxId ? (
        <PageSection title="Request correction (management approval)" className="mt-8">
          <Card className="max-w-lg space-y-3 p-4">
            <form onSubmit={submitEditRequest}>
              <Input
                label="Correct amount (€)"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                inputMode="decimal"
              />
              <Input
                label="Why is this change needed?"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                required
              />
              <div className="mt-3 flex gap-2">
                <Button type="submit" disabled={busy}>
                  Submit request
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEditTxId(null)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        </PageSection>
      ) : null}

      {canApprove && pendingRequests.length > 0 ? (
        <PageSection title="Pending correction requests" className="mt-8">
          <Card className="divide-y">
            {pendingRequests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
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
        </PageSection>
      ) : null}
    </AppShell>
  );
}
