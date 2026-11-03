"use client";

import { useState } from "react";
import { format } from "date-fns";
import { formatAdminMoney } from "@/components/administration/AdministrationLedgerTable";
import {
  INVOICE_SETTLEMENT_STATUSES,
  settlementStatusLabel,
  settlementStatusRequiresAmount,
  type InvoiceSettlementStatus,
} from "@/lib/administration/invoice-settlement";
import type { DebtInvoiceLine } from "@/components/administration/finance/finance-debt-types";
import { Button, Card, EmptyState } from "@/components/ui";

function SettlementEditor({
  row,
  onSaved,
}: {
  row: DebtInvoiceLine;
  onSaved?: () => void;
}) {
  const [status, setStatus] = useState(
    (row.settlementStatus as InvoiceSettlementStatus | null) ?? "unknown"
  );
  const [paidEuros, setPaidEuros] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const paidAmountCents =
        paidEuros.trim() === ""
          ? null
          : Math.round(Number.parseFloat(paidEuros.replace(",", ".")) * 100);
      const res = await fetch("/api/administration/finance/prodata-invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: row.invoiceNumber,
          settlementStatus: status,
          paidAmountCents,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      onSaved?.();
    } catch {
      // parent may refresh on next navigation
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-zinc-600">
        {settlementStatusLabel(row.settlementStatus)}
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
      {settlementStatusRequiresAmount(status) ? (
        <input
          type="text"
          inputMode="decimal"
          placeholder="Paid €"
          className="w-full rounded border border-zinc-200 px-1.5 py-1 text-xs"
          value={paidEuros}
          onChange={(e) => setPaidEuros(e.target.value)}
        />
      ) : null}
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => void save()}
      >
        {busy ? "…" : "Save"}
      </Button>
    </div>
  );
}

export function OpenDebtsTable({
  rows,
  onOpenClient,
  onSettlementSaved,
}: {
  rows: DebtInvoiceLine[];
  onOpenClient: (clientKey: string) => void;
  onSettlementSaved?: () => void;
}) {
  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState title="No open debts match these filters." />
      </Card>
    );
  }

  return (
    <Card className="overflow-x-auto p-0">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
          <tr>
            <th className="px-3 py-2">Agent</th>
            <th className="px-3 py-2">Client</th>
            <th className="px-3 py-2">Invoice</th>
            <th className="px-3 py-2">Order date</th>
            <th className="px-3 py-2">Days</th>
            <th className="px-3 py-2">Invoiced</th>
            <th className="px-3 py-2">Due</th>
            <th className="px-3 py-2">Payment status</th>
            <th className="px-3 py-2 text-right">Client card</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.invoiceNumber}-${row.clientKey}`} className="border-t">
              <td className="px-3 py-2">{row.salesAgentName}</td>
              <td className="px-3 py-2 font-medium">{row.displayName}</td>
              <td className="px-3 py-2 font-mono text-xs">{row.invoiceNumber}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                {row.orderDate
                  ? format(new Date(row.orderDate), "d MMM yyyy")
                  : "—"}
              </td>
              <td className="px-3 py-2">{row.daysOutstanding}</td>
              <td className="px-3 py-2">{formatAdminMoney(row.invoicedCents)}</td>
              <td className="px-3 py-2 font-medium text-red-700">
                {formatAdminMoney(row.balanceDueCents)}
              </td>
              <td className="min-w-[10rem] px-3 py-2">
                <SettlementEditor row={row} onSaved={onSettlementSaved} />
                {row.paymentMethodRaw?.trim() ? (
                  <span className="mt-1 block truncate text-[10px] text-zinc-400">
                    Excel: {row.paymentMethodRaw}
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2 text-right">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onOpenClient(row.clientKey)}
                >
                  Open
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
