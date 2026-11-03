"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildSettlementOverrides,
  ProDataImportSettlementEditor,
  type SettlementRowState,
} from "@/components/administration/ProDataImportSettlementEditor";
import type { ProDataInvoiceAggregate } from "@/lib/administration/prodata-transaction-book";
import { proDataFinanceRowToAggregate } from "@/lib/services/prodata-invoice-display";
import { saveInvoiceSettlement } from "@/components/administration/finance/InlineInvoiceSettlementForm";
import { Alert, Button, LoadingState } from "@/components/ui";

type ApiInvoice = {
  invoiceNumber: string;
  documentCategory: string;
  transactionDate: string;
  buyerName: string;
  salesAgentName: string | null;
  netValueCents: number;
  lineCount: number;
  paymentMethod: string | null;
  paymentMethodRaw: string | null;
  settlementStatus: string;
  paidAmountCents: number | null;
};

function rowsFromInvoices(invoices: ProDataInvoiceAggregate[]) {
  const init: Record<string, SettlementRowState> = {};
  for (const inv of invoices) {
    init[inv.invoiceNumber] = {
      settlementStatus: inv.settlementStatus,
      paidAmountEuros:
        inv.paidAmountCents != null ? String(inv.paidAmountCents / 100) : "",
      paymentMethod: inv.paymentMethod ?? "",
    };
  }
  return init;
}

export function ManagedProDataSettlements() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [invoices, setInvoices] = useState<ProDataInvoiceAggregate[]>([]);
  const [rows, setRows] = useState<Record<string, SettlementRowState>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/administration/finance/prodata-invoices", {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        invoices?: ApiInvoice[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not load invoices");
      const list = (data.invoices ?? []).map((r) =>
        proDataFinanceRowToAggregate({
          ...r,
          documentCategory: r.documentCategory as ProDataInvoiceAggregate["documentCategory"],
          settlementStatus: r.settlementStatus as ProDataInvoiceAggregate["settlementStatus"],
        })
      );
      setInvoices(list);
      setRows(rowsFromInvoices(list));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveAll() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const overrides = buildSettlementOverrides(invoices, rows);
      let saved = 0;
      for (const o of overrides) {
        await saveInvoiceSettlement({
          invoiceNumber: o.invoiceNumber,
          settlementStatus: o.settlementStatus,
          paidAmountCents: o.paidAmountCents ?? null,
          paymentMethod: o.paymentMethod ?? null,
        });
        saved += 1;
      }
      setMessage(`Saved payment status for ${saved} invoice(s). Open debts will refresh on next load.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingState title="Loading imported invoices…" />;
  }

  if (invoices.length === 0) {
    return (
      <Alert tone="info">
        No Pro-Data invoices in the system yet. Go to{" "}
        <strong>Excel import</strong>, upload Libri i transaksioneve, preview,
        set MENYRA E PAGESES in the table, then import.
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {message ? <Alert tone="info">{message}</Alert> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={saving} onClick={() => void saveAll()}>
          {saving ? "Saving…" : "Save all changes to system"}
        </Button>
        <Button variant="secondary" disabled={saving} onClick={() => void load()}>
          Reload
        </Button>
      </div>
      <ProDataImportSettlementEditor
        invoices={invoices}
        rows={rows}
        onRowsChange={setRows}
      />
    </div>
  );
}
