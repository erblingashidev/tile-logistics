"use client";

import { useMemo, useState } from "react";
import type { ProDataInvoiceAggregate } from "@/lib/administration/prodata-transaction-book";
import {
  INVOICE_SETTLEMENT_STATUSES,
  settlementStatusLabel,
  settlementStatusRequiresAmount,
  type InvoiceSettlementStatus,
} from "@/lib/administration/invoice-settlement";
import { ADMIN_PAYMENT_METHODS } from "@/lib/administration/constants";
import type { AdminPaymentMethod } from "@/lib/administration/constants";
import type { ProDataInvoiceSettlementOverride } from "@/lib/services/finance-prodata-import";
import { Button, Card, Select } from "@/components/ui";

export type SettlementRowState = {
  settlementStatus: InvoiceSettlementStatus;
  paidAmountEuros: string;
  paymentMethod: string;
};

function initRow(inv: ProDataInvoiceAggregate): SettlementRowState {
  return {
    settlementStatus: inv.settlementStatus,
    paidAmountEuros:
      inv.paidAmountCents != null
        ? String(inv.paidAmountCents / 100)
        : "",
    paymentMethod: inv.paymentMethod ?? "",
  };
}

export function buildSettlementOverrides(
  invoices: ProDataInvoiceAggregate[],
  rows: Record<string, SettlementRowState>
): ProDataInvoiceSettlementOverride[] {
  return invoices.map((inv) => {
    const row = rows[inv.invoiceNumber] ?? initRow(inv);
    const paidAmountCents =
      row.paidAmountEuros.trim() === ""
        ? null
        : Math.round(Number.parseFloat(row.paidAmountEuros.replace(",", ".")) * 100);
    return {
      invoiceNumber: inv.invoiceNumber,
      settlementStatus: row.settlementStatus,
      paidAmountCents:
        paidAmountCents != null && Number.isFinite(paidAmountCents)
          ? paidAmountCents
          : null,
      paymentMethod: row.paymentMethod
        ? (row.paymentMethod as AdminPaymentMethod)
        : null,
    };
  });
}

export function ProDataImportSettlementEditor({
  invoices,
  rows,
  onRowsChange,
}: {
  invoices: ProDataInvoiceAggregate[];
  rows: Record<string, SettlementRowState>;
  onRowsChange: (next: Record<string, SettlementRowState>) => void;
}) {
  const [filter, setFilter] = useState<"all" | "needs">("needs");
  const [bulkStatus, setBulkStatus] = useState<InvoiceSettlementStatus>("unpaid");

  const visible = useMemo(() => {
    if (filter === "all") return invoices;
    return invoices.filter(
      (inv) =>
        (rows[inv.invoiceNumber]?.settlementStatus ?? inv.settlementStatus) ===
          "unknown" || !inv.paymentMethodRaw.trim()
    );
  }, [filter, invoices, rows]);

  function patchRow(invoiceNumber: string, patch: Partial<SettlementRowState>) {
    const inv = invoices.find((i) => i.invoiceNumber === invoiceNumber);
    if (!inv) return;
    onRowsChange({
      ...rows,
      [invoiceNumber]: {
        ...(rows[invoiceNumber] ?? initRow(inv)),
        ...patch,
      },
    });
  }

  function applyBulkToNeeds() {
    const next = { ...rows };
    for (const inv of invoices) {
      const current = next[inv.invoiceNumber] ?? initRow(inv);
      if (current.settlementStatus !== "unknown" && inv.paymentMethodRaw.trim()) {
        continue;
      }
      next[inv.invoiceNumber] = {
        ...current,
        settlementStatus: bulkStatus,
      };
    }
    onRowsChange(next);
  }

  return (
    <Card className="mt-6 overflow-hidden p-0">
      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
        <p className="text-sm font-medium text-zinc-900">
          MENYRA E PAGESES → payment status in our system
        </p>
        <p className="mt-1 text-xs text-zinc-600">
          Set how each invoice is settled (full debt, paid entirely, partial,
          prepaid, etc.). Partial and prepaid partial need an amount in €.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Select
            label="Show"
            value={filter}
            onChange={(e) => setFilter(e.target.value as "all" | "needs")}
          >
            <option value="needs">Needs assignment first</option>
            <option value="all">All invoices ({invoices.length})</option>
          </Select>
          <Select
            label="Apply to empty / not set"
            value={bulkStatus}
            onChange={(e) =>
              setBulkStatus(e.target.value as InvoiceSettlementStatus)
            }
          >
            {INVOICE_SETTLEMENT_STATUSES.filter((s) => s.id !== "unknown").map(
              (s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              )
            )}
          </Select>
          <Button size="sm" variant="secondary" onClick={applyBulkToNeeds}>
            Apply bulk
          </Button>
        </div>
      </div>
      <div className="max-h-[min(28rem,60vh)] overflow-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 bg-white text-xs uppercase text-zinc-500 shadow-sm">
            <tr>
              <th className="px-3 py-2">Invoice</th>
              <th className="px-3 py-2">Client</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Pro-Data (Menyra)</th>
              <th className="px-3 py-2">Our status</th>
              <th className="px-3 py-2">Paid €</th>
              <th className="px-3 py-2">Register method</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((inv) => {
              const row = rows[inv.invoiceNumber] ?? initRow(inv);
              const needsAmount = settlementStatusRequiresAmount(
                row.settlementStatus
              );
              return (
                <tr key={inv.invoiceNumber} className="border-t align-top">
                  <td className="px-3 py-2 font-mono text-xs">
                    {inv.invoiceNumber}
                  </td>
                  <td className="max-w-[10rem] truncate px-3 py-2">
                    {inv.buyerName}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    €{inv.netValueEuros.toFixed(2)}
                  </td>
                  <td className="max-w-[8rem] truncate px-3 py-2 text-xs text-zinc-500">
                    {inv.paymentMethodRaw.trim() || "— empty —"}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className="w-full min-w-[11rem] rounded border border-zinc-200 px-2 py-1.5 text-sm"
                      value={row.settlementStatus}
                      onChange={(e) =>
                        patchRow(inv.invoiceNumber, {
                          settlementStatus: e.target
                            .value as InvoiceSettlementStatus,
                        })
                      }
                    >
                      {INVOICE_SETTLEMENT_STATUSES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      disabled={!needsAmount}
                      placeholder={needsAmount ? "0.00" : "—"}
                      className="w-24 rounded border border-zinc-200 px-2 py-1.5 text-sm disabled:bg-zinc-50"
                      value={row.paidAmountEuros}
                      onChange={(e) =>
                        patchRow(inv.invoiceNumber, {
                          paidAmountEuros: e.target.value,
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className="w-full min-w-[7rem] rounded border border-zinc-200 px-2 py-1.5 text-sm"
                      value={row.paymentMethod}
                      onChange={(e) =>
                        patchRow(inv.invoiceNumber, {
                          paymentMethod: e.target.value,
                        })
                      }
                    >
                      <option value="">—</option>
                      {ADMIN_PAYMENT_METHODS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {visible.length === 0 ? (
        <p className="p-4 text-sm text-zinc-500">
          No rows in this view — switch to &quot;All invoices&quot; or adjust
          bulk assignment.
        </p>
      ) : null}
    </Card>
  );
}

export function settlementSummaryLine(
  status: InvoiceSettlementStatus
): string {
  return settlementStatusLabel(status);
}
