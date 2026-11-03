"use client";

import { useState } from "react";
import {
  INVOICE_SETTLEMENT_STATUSES,
  settlementStatusRequiresAmount,
  type InvoiceSettlementStatus,
} from "@/lib/administration/invoice-settlement";
import type { AdminPaymentMethod } from "@/lib/administration/constants";
import { AdminPaymentMethodPicker } from "@/components/administration/AdminPaymentMethodPicker";
import { useAppMessages } from "@/components/i18n/LocaleProvider";
import { settlementLabel } from "@/lib/i18n/finance-labels";
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
  const t = useAppMessages();
  const s = t.finance.settlement;
  const tbl = t.finance.table;
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
      setError(e instanceof Error ? e.message : t.finance.common.loadFailed);
    } finally {
      setBusy(false);
    }
  }

  const needsAmount = settlementStatusRequiresAmount(status);

  return (
    <div className={compact ? "space-y-1" : "space-y-2"}>
      <p className="text-xs text-zinc-600">
        {settlementLabel(t, initialStatus)}
      </p>
      <select
        className="w-full rounded border border-zinc-200 px-1.5 py-1 text-xs"
        value={status}
        onChange={(e) => setStatus(e.target.value as InvoiceSettlementStatus)}
      >
        {INVOICE_SETTLEMENT_STATUSES.map((st) => (
          <option key={st.id} value={st.id}>
            {settlementLabel(t, st.id)}
          </option>
        ))}
      </select>
      {needsAmount ? (
        <input
          type="text"
          inputMode="decimal"
          placeholder={s.partialPlaceholder}
          className="w-full rounded border border-zinc-200 px-1.5 py-1 text-xs"
          value={paidEuros}
          onChange={(e) => setPaidEuros(e.target.value)}
        />
      ) : null}
      <AdminPaymentMethodPicker
        label={s.registerMethod}
        value={paymentMethod}
        onChange={(id) => setPaymentMethod(id)}
        allowClear
        clearLabel="—"
      />
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => void save()}
      >
        {busy ? t.common.loading : s.saveStatus}
      </Button>
      {paymentMethodRaw?.trim() ? (
        <span className="block truncate text-[10px] text-zinc-400">
          {tbl.excelMenyra} {paymentMethodRaw}
        </span>
      ) : null}
    </div>
  );
}
