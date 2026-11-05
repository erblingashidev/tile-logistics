"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import type { ProDataInvoiceAggregate } from "@/lib/administration/prodata-transaction-book";
import { proDataFinanceRowToAggregate } from "@/lib/services/prodata-invoice-display";
import {
  saveInvoiceSettlement,
} from "@/components/administration/finance/InlineInvoiceSettlementForm";
import { AdminPaymentMethodPicker } from "@/components/administration/AdminPaymentMethodPicker";
import { AdminSettlementStatusPicker } from "@/components/administration/AdminSettlementStatusPicker";
import {
  settlementStatusRequiresAmount,
  type InvoiceSettlementStatus,
} from "@/lib/administration/invoice-settlement";
import type { AdminPaymentMethod } from "@/lib/administration/constants";
import { useAppMessages } from "@/components/i18n/LocaleProvider";
import { Alert, Button, Card, EmptyState, LoadingState } from "@/components/ui";

type ApiInvoice = {
  invoiceNumber: string;
  documentCategory: string;
  transactionDate: string;
  buyerName: string;
  salesAgentName: string | null;
  netValueCents: number;
  paymentMethod: string | null;
  paymentMethodRaw: string | null;
  settlementStatus: string;
  paidAmountCents: number | null;
};

function AssignmentRow({
  inv,
  onSaved,
}: {
  inv: ProDataInvoiceAggregate;
  onSaved: () => void;
}) {
  const t = useAppMessages();
  const s = t.finance.settlement;
  const q = t.finance.pages.assignmentQueue;
  const [status, setStatus] = useState<InvoiceSettlementStatus>(
    inv.settlementStatus === "unknown" ? "unpaid" : inv.settlementStatus
  );
  const [paidEuros, setPaidEuros] = useState(
    inv.paidAmountCents != null ? String(inv.paidAmountCents / 100) : ""
  );
  const [paymentMethod, setPaymentMethod] = useState(inv.paymentMethod ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const needsAmount = settlementStatusRequiresAmount(status);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const paidAmountCents =
        paidEuros.trim() === ""
          ? null
          : Math.round(Number.parseFloat(paidEuros.replace(",", ".")) * 100);
      if (!paymentMethod.trim()) {
        throw new Error(q.needPaymentMethod);
      }
      await saveInvoiceSettlement({
        invoiceNumber: inv.invoiceNumber,
        settlementStatus: status,
        paidAmountCents,
        paymentMethod: paymentMethod as AdminPaymentMethod,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.finance.common.loadFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-t align-top">
      <td className="px-4 py-3 font-mono text-sm">{inv.invoiceNumber}</td>
      <td className="max-w-[12rem] px-4 py-3 font-medium">{inv.buyerName}</td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600">
        {inv.transactionDate
          ? format(new Date(inv.transactionDate.slice(0, 10)), "d MMM yyyy")
          : "—"}
      </td>
      <td className="whitespace-nowrap px-4 py-3 font-medium">
        €{inv.netValueEuros.toFixed(2)}
      </td>
      <td className="max-w-[10rem] truncate px-4 py-3 text-sm text-zinc-500">
        {inv.paymentMethodRaw.trim() || s.emptyMenyra}
      </td>
      <td className="min-w-[14rem] px-4 py-3">
        <AdminSettlementStatusPicker value={status} onChange={setStatus} />
      </td>
      <td className="px-4 py-3">
        <input
          type="text"
          inputMode="decimal"
          disabled={!needsAmount}
          placeholder={needsAmount ? s.partialPlaceholder : "—"}
          className="w-28 rounded-lg border border-zinc-300 px-3 py-2 text-base shadow-sm disabled:bg-zinc-50"
          value={paidEuros}
          onChange={(e) => setPaidEuros(e.target.value)}
        />
      </td>
      <td className="min-w-[12rem] px-4 py-3">
        <AdminPaymentMethodPicker
          value={paymentMethod}
          onChange={setPaymentMethod}
          allowClear={false}
        />
      </td>
      <td className="px-4 py-3">
        {error ? <p className="mb-2 text-xs text-red-600">{error}</p> : null}
        <Button size="sm" variant="success" disabled={busy} onClick={() => void save()}>
          {busy ? t.common.loading : s.saveStatus}
        </Button>
      </td>
    </tr>
  );
}

export function PendingInvoiceAssignmentQueue() {
  const t = useAppMessages();
  const q = t.finance.pages.assignmentQueue;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [invoices, setInvoices] = useState<ProDataInvoiceAggregate[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/administration/finance/pending-settlements", {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        invoices?: ApiInvoice[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? t.finance.common.loadFailed);
      setInvoices(
        (data.invoices ?? []).map((r) =>
          proDataFinanceRowToAggregate({
            ...r,
            lineCount: 1,
            documentCategory: r.documentCategory as ProDataInvoiceAggregate["documentCategory"],
            settlementStatus: r.settlementStatus as ProDataInvoiceAggregate["settlementStatus"],
          })
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t.finance.common.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [t.finance.common.loadFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <LoadingState title={q.loading} />;
  }

  if (error) {
    return <Alert tone="error">{error}</Alert>;
  }

  if (invoices.length === 0) {
    return (
      <Card className="p-8">
        <EmptyState title={q.allDone} />
        <p className="mt-2 text-center text-base text-zinc-600">{q.allDoneHint}</p>
      </Card>
    );
  }

  const tbl = t.finance.table;
  const s = t.finance.settlement;

  return (
    <div className="space-y-4">
      <Alert tone="info">
        {q.banner.replace("{count}", String(invoices.length))}
      </Alert>
      <Card className="overflow-x-auto p-0">
        <table className="min-w-full text-left text-base">
          <thead className="bg-zinc-50 text-sm font-semibold uppercase text-zinc-600">
            <tr>
              <th className="px-4 py-3">{tbl.invoice}</th>
              <th className="px-4 py-3">{tbl.client}</th>
              <th className="px-4 py-3">{tbl.orderDate}</th>
              <th className="px-4 py-3">{s.total}</th>
              <th className="px-4 py-3">{s.prodataMenyra}</th>
              <th className="px-4 py-3">{s.ourStatus}</th>
              <th className="px-4 py-3">{s.paidEuros}</th>
              <th className="px-4 py-3">{s.registerMethod}</th>
              <th className="px-4 py-3">{q.action}</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <AssignmentRow
                key={inv.invoiceNumber}
                inv={inv}
                onSaved={() => void load()}
              />
            ))}
          </tbody>
        </table>
      </Card>
      <Button variant="secondary" onClick={() => void load()}>
        {t.finance.settlement.reload}
      </Button>
    </div>
  );
}
