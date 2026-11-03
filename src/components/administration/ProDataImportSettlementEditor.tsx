"use client";

import { useMemo, useState } from "react";
import type { ProDataInvoiceAggregate } from "@/lib/administration/prodata-transaction-book";
import {
  settlementStatusRequiresAmount,
  type InvoiceSettlementStatus,
} from "@/lib/administration/invoice-settlement";
import { useAppMessages } from "@/components/i18n/LocaleProvider";
import type { AdminPaymentMethod } from "@/lib/administration/constants";
import { AdminPaymentMethodPicker } from "@/components/administration/AdminPaymentMethodPicker";
import { AdminSettlementStatusPicker } from "@/components/administration/AdminSettlementStatusPicker";
import type { ProDataInvoiceSettlementOverride } from "@/lib/services/finance-prodata-import";
import { Button, Card } from "@/components/ui";

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
  const t = useAppMessages();
  const s = t.finance.settlement;
  const [filter, setFilter] = useState<"all" | "needs">("all");
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
        <p className="text-sm font-medium text-zinc-900">{s.editorTitle}</p>
        <p className="mt-1 text-xs text-zinc-600">{s.editorHint}</p>
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-zinc-700">{s.show}</span>
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant={filter === "needs" ? "primary" : "secondary"}
                onClick={() => setFilter("needs")}
              >
                {s.showNeeds}
              </Button>
              <Button
                size="sm"
                variant={filter === "all" ? "primary" : "secondary"}
                onClick={() => setFilter("all")}
              >
                {s.showAll} ({invoices.length})
              </Button>
            </div>
          </div>
          <AdminSettlementStatusPicker
            label={s.bulkApply}
            value={bulkStatus}
            onChange={setBulkStatus}
            excludeStatuses={["unknown"]}
          />
          <Button size="sm" variant="secondary" onClick={applyBulkToNeeds}>
            {s.applyBulk}
          </Button>
        </div>
      </div>
      <div className="max-h-[min(28rem,60vh)] overflow-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 bg-white text-xs uppercase text-zinc-500 shadow-sm">
            <tr>
              <th className="px-3 py-2">{s.invoice}</th>
              <th className="px-3 py-2">{t.finance.table.client}</th>
              <th className="px-3 py-2">{s.total}</th>
              <th className="px-3 py-2">{s.prodataMenyra}</th>
              <th className="px-3 py-2">{s.ourStatus}</th>
              <th className="px-3 py-2">{s.paidEuros}</th>
              <th className="px-3 py-2">{s.registerMethod}</th>
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
                    {inv.paymentMethodRaw.trim() || s.emptyMenyra}
                  </td>
                  <td className="min-w-[14rem] px-3 py-2">
                    <AdminSettlementStatusPicker
                      value={row.settlementStatus}
                      onChange={(settlementStatus) =>
                        patchRow(inv.invoiceNumber, { settlementStatus })
                      }
                    />
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
                  <td className="min-w-[12rem] px-3 py-2">
                    <AdminPaymentMethodPicker
                      value={row.paymentMethod}
                      onChange={(id) =>
                        patchRow(inv.invoiceNumber, {
                          paymentMethod: id,
                        })
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {visible.length === 0 ? (
        <p className="p-4 text-sm text-zinc-500">{s.noRowsView}</p>
      ) : null}
    </Card>
  );
}

