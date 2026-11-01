"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  ADMIN_PAYMENT_METHODS,
  ADMIN_TRANSACTION_KINDS,
} from "@/lib/administration/constants";
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
  notes: string;
}) {
  return {
    kind: form.kind,
    paymentMethod: form.kind === "expense" ? null : form.paymentMethod || null,
    amountCents: Math.round(parseFloat(form.amount || "0") * 100),
    counterpartyName: form.counterparty.trim() || null,
    purpose: form.purpose.trim() || null,
    expenseCategory:
      form.kind === "expense" ? form.expenseCategory.trim() || null : null,
    invoiceReference: form.invoiceReference.trim() || null,
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
  emptyTitle = "No transactions in this range",
}: {
  transactions: AdministrationTransaction[];
  canApprove: boolean;
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
    notes: "",
  });
  const [requestReason, setRequestReason] = useState("");

  function openEditor(transaction: AdministrationTransaction, mode: EditorMode) {
    setEditor({ mode, transaction });
    setForm(formFromTransaction(transaction));
    setRequestReason("");
  }

  function closeEditor() {
    setEditor(null);
    setRequestReason("");
  }

  async function submitEditor(e: React.FormEvent) {
    e.preventDefault();
    if (!editor) return;
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
                <th className="px-3 py-2">Party</th>
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
                  <td className="px-3 py-2 max-w-xs truncate">
                    {t.purpose ?? "—"}
                  </td>
                  <td className="px-3 py-2">{t.locked ? "Yes" : "No"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy || t.locked || !canApprove}
                        title={
                          t.locked
                            ? "Entry is locked — request edit instead"
                            : !canApprove
                              ? "Only management can edit directly"
                              : "Edit this entry"
                        }
                        onClick={() => openEditor(t, "edit")}
                      >
                        Edit
                      </Button>
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
              <Select
                label="Payment method"
                value={form.paymentMethod}
                onChange={(e) =>
                  setForm((f) => ({ ...f, paymentMethod: e.target.value }))
                }
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
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              inputMode="decimal"
              required
            />
            <Input
              label="Party"
              value={form.counterparty}
              onChange={(e) =>
                setForm((f) => ({ ...f, counterparty: e.target.value }))
              }
            />
            <Input
              label="Purpose"
              value={form.purpose}
              onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
            />
            {form.kind === "expense" ? (
              <Input
                label="Expense category"
                value={form.expenseCategory}
                onChange={(e) =>
                  setForm((f) => ({ ...f, expenseCategory: e.target.value }))
                }
              />
            ) : null}
            <Input
              label="Invoice / receipt ref"
              value={form.invoiceReference}
              onChange={(e) =>
                setForm((f) => ({ ...f, invoiceReference: e.target.value }))
              }
            />
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
