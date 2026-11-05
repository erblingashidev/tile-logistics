"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { AdminPaymentMethodPicker } from "@/components/administration/AdminPaymentMethodPicker";
import {
  ADMIN_EXPENSE_CATEGORIES,
  ADMIN_PAYMENT_METHODS,
  ADMIN_TRANSACTION_KINDS,
} from "@/lib/administration/constants";
import { InvoiceFinanceLink } from "@/components/administration/finance/InvoiceFinanceLink";
import { Button, Card, EmptyState, Input, Select } from "@/components/ui";

export type AdministrationTransaction = {
  id: number;
  kind: string;
  paymentMethod: string | null;
  amountCents: number;
  counterpartyName: string | null;
  purpose: string | null;
  expenseCategory: string | null;
  invoiceReference: string | null;
  salesEmployeeId: number | null;
  salesAgentName: string | null;
  recordedAt: string;
  locked: boolean;
};

export function formatAdminMoney(cents: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

type EditorMode = "edit" | "request";

type EditorState = {
  mode: EditorMode;
  transaction: AdministrationTransaction;
};

function buildPatchFromForm(form: {
  kind: string;
  paymentMethod: string;
  amount: string;
  counterparty: string;
  purpose: string;
  expenseCategory: string;
  invoiceReference: string;
  salesEmployeeId: string;
  notes: string;
}) {
  const incomeLike =
    form.kind === "payment" || form.kind === "return_refund";
  return {
    kind: form.kind,
    paymentMethod: form.kind === "expense" ? null : form.paymentMethod || null,
    amountCents: Math.round(parseFloat(form.amount || "0") * 100),
    counterpartyName: form.counterparty.trim() || null,
    purpose: form.purpose.trim() || null,
    expenseCategory:
      form.kind === "expense" ? form.expenseCategory.trim() || null : null,
    invoiceReference: form.invoiceReference.trim() || null,
    salesEmployeeId: incomeLike
      ? form.salesEmployeeId
        ? Number(form.salesEmployeeId)
        : null
      : undefined,
    notes: form.notes.trim() || null,
  };
}

function formFromTransaction(t: AdministrationTransaction) {
  return {
    kind: t.kind,
    paymentMethod: t.paymentMethod ?? "cash",
    amount: String(Math.abs(t.amountCents) / 100),
    counterparty: t.counterpartyName ?? "",
    purpose: t.purpose ?? "",
    expenseCategory: t.expenseCategory ?? "",
    invoiceReference: t.invoiceReference ?? "",
    salesEmployeeId: t.salesEmployeeId ? String(t.salesEmployeeId) : "",
    notes: "",
  };
}

export function AdministrationLedgerTable({
  transactions,
  canApprove,
  busy,
  onBusyChange,
  onError,
  onUpdated,
  registerStrictTraceability = false,
  emptyTitle = "No transactions in this range",
}: {
  transactions: AdministrationTransaction[];
  canApprove: boolean;
  registerStrictTraceability?: boolean;
  busy: boolean;
  onBusyChange: (v: boolean) => void;
  onError: (message: string) => void;
  onUpdated: () => void | Promise<void>;
  emptyTitle?: string;
}) {
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [form, setForm] = useState({
    kind: "payment",
    paymentMethod: "cash",
    amount: "",
    counterparty: "",
    purpose: "",
    expenseCategory: "",
    invoiceReference: "",
    salesEmployeeId: "",
    notes: "",
  });
  const [requestReason, setRequestReason] = useState("");
  const [salesAgents, setSalesAgents] = useState<
    Array<{ id: number; name: string }>
  >([]);

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

  function openEditor(transaction: AdministrationTransaction, mode: EditorMode) {
    setEditor({ mode, transaction });
    setForm(formFromTransaction(transaction));
    setRequestReason("");
  }

  function closeEditor() {
    setEditor(null);
    setRequestReason("");
  }

  async function deleteEntry(transaction: AdministrationTransaction) {
    if (
      !window.confirm(
        `Remove register entry #${transaction.id}? This is logged and cannot be undone.`
      )
    ) {
      return;
    }
    onBusyChange(true);
    onError("");
    try {
      const res = await fetch(
        `/api/administration/transactions/${transaction.id}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      if (editor?.transaction.id === transaction.id) closeEditor();
      await onUpdated();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      onBusyChange(false);
    }
  }

  async function submitEditor(e: React.FormEvent) {
    e.preventDefault();
    if (!editor) return;
    if (registerStrictTraceability) {
      if (!form.invoiceReference.trim()) {
        onError(
          "Invoice or receipt number is required on every register entry."
        );
        return;
      }
      const incomeLike =
        form.kind === "payment" || form.kind === "return_refund";
      if (incomeLike) {
        if (!form.counterparty.trim()) {
          onError("Customer name is required for payment and refund entries.");
          return;
        }
        if (!form.salesEmployeeId) {
          onError("Sales agent is required for payment and refund entries.");
          return;
        }
      }
    }
    onBusyChange(true);
    onError("");
    const patch = buildPatchFromForm(form);
    try {
      if (editor.mode === "edit") {
        const res = await fetch(
          `/api/administration/transactions/${editor.transaction.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Edit failed");
      } else {
        if (!requestReason.trim()) {
          throw new Error("Explain why management should approve this change.");
        }
        const res = await fetch("/api/administration/edit-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transactionId: editor.transaction.id,
            reason: requestReason.trim(),
            proposedChanges: patch,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Request failed");
      }
      closeEditor();
      await onUpdated();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      onBusyChange(false);
    }
  }

  return (
    <>
      {transactions.length === 0 ? (
        <EmptyState title={emptyTitle} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Kind</th>
                <th className="px-3 py-2">Method</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Customer / party</th>
                <th className="px-3 py-2">Invoice #</th>
                <th className="px-3 py-2">Agent</th>
                <th className="px-3 py-2">Purpose</th>
                <th className="px-3 py-2">Locked</th>
                <th className="px-3 py-2 text-right">Actions</th>
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
                  <td className="px-3 py-2 font-medium">
                    {formatAdminMoney(t.amountCents)}
                  </td>
                  <td className="px-3 py-2">{t.counterpartyName ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {t.invoiceReference?.trim() ? (
                      <InvoiceFinanceLink
                        invoiceNumber={t.invoiceReference}
                        target="debts"
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">{t.salesAgentName ?? "—"}</td>
                  <td className="px-3 py-2 max-w-xs truncate">
                    {t.purpose ?? "—"}
                  </td>
                  <td className="px-3 py-2">{t.locked ? "Yes" : "No"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy || !canApprove}
                        title={
                          !canApprove
                            ? "Only management can edit register entries"
                            : t.locked
                              ? "Management edit (shift closed — change is audited)"
                              : "Edit this entry"
                        }
                        onClick={() => openEditor(t, "edit")}
                      >
                        Edit
                      </Button>
                      {canApprove ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          title="Remove entry (audited)"
                          onClick={() => void deleteEntry(t)}
                        >
                          Delete
                        </Button>
                      ) : null}
                      {!canApprove ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy || !t.locked}
                          title={
                            t.locked
                              ? "Send correction request to management"
                              : "Available after the register shift is closed"
                          }
                          onClick={() => openEditor(t, "request")}
                        >
                          Request edit
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editor ? (
        <Card className="mt-4 max-w-xl space-y-3 p-4">
          <p className="font-medium text-zinc-900">
            {editor.mode === "edit"
              ? `Edit entry #${editor.transaction.id}`
              : `Request management edit — entry #${editor.transaction.id}`}
          </p>
          <form className="space-y-3" onSubmit={submitEditor}>
            <Select
              label="Type"
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
            >
              {ADMIN_TRANSACTION_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </Select>
            {form.kind !== "expense" ? (
              <AdminPaymentMethodPicker
                label="Payment method"
                value={form.paymentMethod}
                onChange={(id) =>
                  setForm((f) => ({ ...f, paymentMethod: id || "cash" }))
                }
                allowClear={false}
              />
            ) : null}
            <Input
              label="Amount (€)"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              inputMode="decimal"
              required
            />
            <Input
              label={
                form.kind === "payment" || form.kind === "return_refund"
                  ? "Customer name"
                  : "Party"
              }
              value={form.counterparty}
              onChange={(e) =>
                setForm((f) => ({ ...f, counterparty: e.target.value }))
              }
              required={
                registerStrictTraceability &&
                (form.kind === "payment" || form.kind === "return_refund")
              }
            />
            <Input
              label="Purpose"
              value={form.purpose}
              onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
            />
            {form.kind === "expense" ? (
              <Select
                label="Expense category"
                value={form.expenseCategory}
                onChange={(e) =>
                  setForm((f) => ({ ...f, expenseCategory: e.target.value }))
                }
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
                form.kind === "payment" || form.kind === "return_refund"
                  ? "Invoice number"
                  : "Invoice / receipt number"
              }
              value={form.invoiceReference}
              onChange={(e) =>
                setForm((f) => ({ ...f, invoiceReference: e.target.value }))
              }
              required={registerStrictTraceability}
            />
            {form.kind === "payment" || form.kind === "return_refund" ? (
              <Select
                label="Sales agent"
                value={form.salesEmployeeId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, salesEmployeeId: e.target.value }))
                }
                required={registerStrictTraceability}
              >
                <option value="">Select agent…</option>
                {salesAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            ) : null}
            {editor.mode === "request" ? (
              <Input
                label="Reason for management"
                value={requestReason}
                onChange={(e) => setRequestReason(e.target.value)}
                required
              />
            ) : null}
            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={busy}>
                {editor.mode === "edit" ? "Save changes" : "Submit request"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={closeEditor}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
    </>
  );
}
