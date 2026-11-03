"use client";

import { useState } from "react";
import {
  INVOICE_SETTLEMENT_STATUSES,
  settlementStatusLabel,
  settlementStatusRequiresAmount,
  type InvoiceSettlementStatus,
} from "@/lib/administration/invoice-settlement";
import { ADMIN_PAYMENT_METHODS } from "@/lib/administration/constants";
import type { AdminPaymentMethod } from "@/lib/administration/constants";
import { Button } from "@/components/ui";

export async function saveInvoiceSettlement(input: {
  invoiceNumber: string;
  settlementStatus: InvoiceSettlementStatus;
  paidAmountCents: number | null;
  paymentMethod?: AdminPaymentMethod | null;
}) {
  const res = await fetch("/api/administration/finance/prodata-invoices", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Save failed");
}

export function InlineInvoiceSettlementForm({
  invoiceNumber,
  settlementStatus: initialStatus,
  paymentMethodRaw,
  onSaved,
  compact = false,
}: {
  invoiceNumber: string;
  settlementStatus: string | null;
  paymentMethodRaw?: string | null;
  onSaved?: () => void;
  compact?: boolean;
}) {
  const [status, setStatus] = useState(
    (initialStatus as InvoiceSettlementStatus | null) ?? "unknown"
  );
  const [paidEuros, setPaidEuros] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      const paidAmountCents =
        paidEuros.trim() === ""
          ? null
          : Math.round(Number.parseFloat(paidEuros.replace(",", ".")) * 100);
      await saveInvoiceSettlement({
        invoiceNumber,
        settlementStatus: status,
        paidAmountCents,
        paymentMethod: paymentMethod
          ? (paymentMethod as AdminPaymentMethod)
          : null,
      });
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const needsAmount = settlementStatusRequiresAmount(status);

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      <p className="text-xs text-zinc-600">
        {settlementStatusLabel(initialStatus)}
      </p>
      <select
        className="w-full rounded border border-zinc-200 px-1.5 py-1 text-xs"
        value={status}
        onChange={(e) => setStatus(e.target.value as InvoiceSettlementStatus)}
      >
        {INVOICE_SETTLEMENT_STATUSES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      {needsAmount ? (
        <input
          type="text"
          inputMode="decimal"
          placeholder="Paid € (partial)"
          className="w-full rounded border border-zinc-200 px-1.5 py-1 text-xs"
          value={paidEuros}
          onChange={(e) => setPaidEuros(e.target.value)}
        />
      ) : null}
      <select
        className="w-full rounded border border-zinc-200 px-1.5 py-1 text-xs"
        value={paymentMethod}
        onChange={(e) => setPaymentMethod(e.target.value)}
      >
        <option value="">Register method (optional)</option>
        {ADMIN_PAYMENT_METHODS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => void save()}
      >
        {busy ? "…" : "Save status"}
      </Button>
      {paymentMethodRaw?.trim() ? (
        <span className="block truncate text-[10px] text-zinc-400">
          Excel Menyra: {paymentMethodRaw}
        </span>
      ) : null}
    </div>
  );
}
