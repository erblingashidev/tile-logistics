"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import {
  ADMIN_EXPENSE_CATEGORIES,
  ADMIN_PAYMENT_METHODS,
  ADMIN_TRANSACTION_KINDS,
} from "@/lib/administration/constants";
import {
  AdministrationFinanceOverview,
  type FinanceOverviewData,
} from "@/components/administration/AdministrationFinanceOverview";
import { AdministrationClientFinance } from "@/components/administration/AdministrationClientFinance";
import {
  AdministrationLedgerTable,
  formatAdminMoney,
  type AdministrationTransaction,
} from "@/components/administration/AdministrationLedgerTable";
import {
  ClosedRegisterSessionsTable,
  RegisterClosePreview,
  RegisterOpenExpectedBanner,
  type ClosedRegisterSession,
} from "@/components/administration/RegisterShiftReconciliation";
import { formatCashVarianceLabel } from "@/lib/administration/register-cash";
import {
  Alert,
  Button,
  Card,
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

type EditRequest = {
  id: number;
  transactionId: number;
  reason: string;
  proposedChangesJson: string;
  createdAt: string;
};

function todayRange() {
  const d = format(new Date(), "yyyy-MM-dd");
  return { from: `${d}T00:00:00.000Z`, to: `${d}T23:59:59.999Z` };
}

export default function AdministrationPage() {
  const [registerSession, setRegisterSession] =
    useState<RegisterSession | null>(null);
  const [expectedCashCents, setExpectedCashCents] = useState<number | null>(
    null
  );
  const [lastCloseVariance, setLastCloseVariance] = useState<number | null>(
    null
  );
  const [closedSessions, setClosedSessions] = useState<ClosedRegisterSession[]>(
    []
  );
  const [transactions, setTransactions] = useState<AdministrationTransaction[]>(
    []
  );
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
  const [filterSearch, setFilterSearch] = useState("");

  const [formKind, setFormKind] = useState("payment");
  const [formPayment, setFormPayment] = useState("cash");
  const [formAmount, setFormAmount] = useState("");
  const [formCounterparty, setFormCounterparty] = useState("");
  const [formPurpose, setFormPurpose] = useState("");
  const [formExpenseCategory, setFormExpenseCategory] = useState("");
  const [formInvoiceRef, setFormInvoiceRef] = useState("");
  const [formSalesAgentId, setFormSalesAgentId] = useState("");
  const [salesAgents, setSalesAgents] = useState<
    Array<{ id: number; name: string }>
  >([]);
  const [invoiceLookupHint, setInvoiceLookupHint] = useState("");

  const [reportSummary, setReportSummary] = useState<{
    grandTotalCents: number;
    rows: Array<{
      paymentMethod: string | null;
      kind: string;
      totalCents: number;
      count: number;
    }>;
  } | null>(null);
  const [overview, setOverview] = useState<FinanceOverviewData | null>(null);

  const loadOverview = useCallback(async () => {
    const params = new URLSearchParams({
      from: `${filterFrom}T00:00:00.000Z`,
      to: `${filterTo}T23:59:59.999Z`,
    });
    const res = await fetch(`/api/administration/overview?${params}`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = await res.json();
    setOverview(data.overview ?? null);
  }, [filterFrom, filterTo]);

  const loadRegister = useCallback(async () => {
    const res = await fetch("/api/administration/register", {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Could not load register");
    const data = await res.json();
    setRegisterSession(data.session ?? null);
    setExpectedCashCents(
      typeof data.expectedCashCents === "number" ? data.expectedCashCents : null
    );
  }, []);

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
    if (!res.ok) throw new Error("Could not load transactions");
    const data = await res.json();
    setTransactions(data.transactions ?? []);
  }, [filterFrom, filterTo, filterPayment, filterKind, filterSearch]);

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
        loadRegister(),
        loadTransactions(),
        loadPending(),
        loadClosedSessions(),
        loadOverview(),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }, [
    loadRegister,
    loadTransactions,
    loadPending,
    loadClosedSessions,
    loadOverview,
  ]);

  useEffect(() => {
    fetch("/api/employees", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Array<{ id: number; name: string; roles?: string[] }>) => {
        if (!Array.isArray(rows)) return;
        setSalesAgents(
          rows.filter((e) =>
            (e.roles ?? []).some(
              (r) => r === "sales_agent" || r === "sales_admin"
            )
          )
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (formKind !== "payment" || !formInvoiceRef.trim()) {
      setInvoiceLookupHint("");
      return;
    }
    const t = setTimeout(() => {
      void fetch(
        `/api/administration/invoice-lookup?invoice=${encodeURIComponent(formInvoiceRef.trim())}`,
        { cache: "no-store" }
      )
        .then((r) => r.json())
        .then((data) => {
          if (!data.found) {
            setInvoiceLookupHint("No order found — pick sales agent manually.");
            return;
          }
          setFormCounterparty((c) => c || data.customerName || "");
          if (data.salesEmployeeId) {
            setFormSalesAgentId(String(data.salesEmployeeId));
          }
          const price = data.priceCents / 100;
          setInvoiceLookupHint(
            `Order found · ${data.status} · €${price.toFixed(2)}${data.salesAgentName ? ` · Agent: ${data.salesAgentName}` : ""}`
          );
        })
        .catch(() => setInvoiceLookupHint(""));
    }, 400);
    return () => clearTimeout(t);
  }, [formKind, formInvoiceRef]);

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
      setExpectedCashCents(null);
      if (typeof data.cashVarianceCents === "number") {
        setLastCloseVariance(data.cashVarianceCents);
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitTransaction(e: React.FormEvent) {
    e.preventDefault();
    if (formKind === "payment") {
      if (!formCounterparty.trim()) {
        setError("Customer name is required for payment (income).");
        return;
      }
      if (!formInvoiceRef.trim()) {
        setError("Invoice number is required for payment (income).");
        return;
      }
    }
    if (formKind === "expense" && !formExpenseCategory) {
      setError("Choose an expense category.");
      return;
    }
    if (formKind === "payment" && !formSalesAgentId) {
      setError("Sales agent is required for payment (income).");
      return;
    }
    const agent = salesAgents.find((a) => String(a.id) === formSalesAgentId);
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
          idempotencyKey: crypto.randomUUID(),
          salesEmployeeId: formKind === "payment" ? Number(formSalesAgentId) : null,
          salesAgentName: agent?.name ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setFormAmount("");
      setFormPurpose("");
      setFormCounterparty("");
      setFormInvoiceRef("");
      setFormSalesAgentId("");
      setInvoiceLookupHint("");
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

  function exportLedgerCsv() {
    const params = new URLSearchParams({
      from: `${filterFrom}T00:00:00.000Z`,
      to: `${filterTo}T23:59:59.999Z`,
    });
    window.location.href = `/api/administration/export?${params}`;
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
      description="Cash register, payments, expenses, reconciliation, and audit. Duplicate invoice payments are blocked; shift close runs in one atomic step."
      contentMaxWidth="wide"
    >
      {error ? (
        <Alert tone="error">
          {error}
        </Alert>
      ) : null}

      <PageSection title="Finance overview" className="mb-8">
        <AdministrationFinanceOverview
          overview={overview}
          periodLabel={`Summary for ${filterFrom}${filterTo && filterTo !== filterFrom ? ` → ${filterTo}` : ""} (uses filter dates below)`}
        />
      </PageSection>

      <div className="grid gap-4 lg:grid-cols-2">
        <PageSection title="Cash register shift">
          <Card className="space-y-4 p-4">
            {registerOpen && registerSession ? (
              <>
                <p className="text-sm text-zinc-600">
                  Open since{" "}
                  {format(new Date(registerSession.openedAt), "PPp")}. Opening
                  float: {formatAdminMoney(registerSession.openingFloatCents)}.
                </p>
                <p className="text-sm font-medium text-emerald-700">
                  Register is open — record all payments and expenses before
                  closing.
                </p>
                <RegisterOpenExpectedBanner
                  expectedCashCents={expectedCashCents}
                />
                <Input
                  label="Counted cash in drawer (€)"
                  value={closingCounted}
                  onChange={(e) => setClosingCounted(e.target.value)}
                  inputMode="decimal"
                />
                <RegisterClosePreview
                  expectedCashCents={expectedCashCents}
                  countedEuros={closingCounted}
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
            {lastCloseVariance != null ? (
              <p className="text-sm font-medium text-zinc-800">
                Last shift close:{" "}
                {formatCashVarianceLabel(lastCloseVariance, formatAdminMoney)}
              </p>
            ) : null}
            <p className="text-xs text-zinc-500">
              Today&apos;s recorded payments (filter list):{" "}
              {formatAdminMoney(dayTotals)}
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
                  formKind === "expense"
                    ? "Paid to (person / vendor)"
                    : "Customer name"
                }
                value={formCounterparty}
                onChange={(e) => setFormCounterparty(e.target.value)}
                required={formKind === "payment"}
              />
              <Input
                label="Purpose / description"
                value={formPurpose}
                onChange={(e) => setFormPurpose(e.target.value)}
              />
              {formKind === "expense" ? (
                <Select
                  label="Expense category"
                  value={formExpenseCategory}
                  onChange={(e) => setFormExpenseCategory(e.target.value)}
                  required
                >
                  <option value="">Select category…</option>
                  {ADMIN_EXPENSE_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              ) : null}
              <Input
                label={
                  formKind === "payment"
                    ? "Invoice number"
                    : "Invoice / receipt reference"
                }
                value={formInvoiceRef}
                onChange={(e) => setFormInvoiceRef(e.target.value)}
                required={formKind === "payment"}
                hint={
                  formKind === "payment"
                    ? invoiceLookupHint ||
                      "Required — links payment to order, customer, and sales agent."
                    : undefined
                }
              />
              {formKind === "payment" ? (
                <Select
                  label="Sales agent"
                  value={formSalesAgentId}
                  onChange={(e) => setFormSalesAgentId(e.target.value)}
                  required
                >
                  <option value="">Select agent…</option>
                  {salesAgents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              ) : null}
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

      <PageSection title="Debts & client follow-up" className="mt-8">
        <AdministrationClientFinance />
      </PageSection>

      <PageSection title="Shift close results" className="mt-8">
        <Card className="p-4">
          <p className="mb-3 text-sm text-zinc-600">
            Compare counted cash to expected (opening float + cash in − cash out)
            for each closed shift in the filter range.
          </p>
          <ClosedRegisterSessionsTable sessions={closedSessions} />
        </Card>
      </PageSection>

      <PageSection title="Ledger & filters" className="mt-8">
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
                Generate report
              </Button>
            ) : null}
            <Button variant="secondary" disabled={busy} onClick={exportLedgerCsv}>
              Export CSV
            </Button>
          </div>
        </Card>

        {reportSummary ? (
          <Card className="mb-4 p-4">
            <p className="mb-2 font-medium">Report summary</p>
            <p className="text-sm text-zinc-600">
              Net total: {formatAdminMoney(reportSummary.grandTotalCents)}
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {reportSummary.rows.map((r, i) => (
                <li key={i}>
                  {r.kind} / {r.paymentMethod ?? "—"}:{" "}
                  {formatAdminMoney(Number(r.totalCents))}{" "}
                  ({r.count} lines)
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
      </PageSection>

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
