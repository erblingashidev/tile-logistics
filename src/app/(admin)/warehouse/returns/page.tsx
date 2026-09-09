"use client";

import { useCallback, useEffect, useState } from "react";
import {
  checklistToReturnLines,
  CustomerReturnChecklist,
  emptyReturnChecklist,
  type ReturnChecklistState,
} from "@/components/CustomerReturnChecklist";
import { InvoiceNumberField } from "@/components/InvoiceNumberField";
import { AppShell } from "@/components/layout/AppShell";
import { Button, Card } from "@/components/ui";
import { WarehouseNav } from "@/components/warehouse/WarehouseNav";
import type { ReturnableLine } from "@/lib/services/customer-returns";

type LookupResult = {
  orderId: number;
  invoiceNumber: string;
  customerName: string | null;
  orderDate: string | null;
  status: string;
  lines: ReturnableLine[];
  hasOpenReturnable: boolean;
};

type RecentReturn = {
  id: number;
  invoiceNumber: string;
  status: string;
  notes: string | null;
  createdAt: string;
  postedAt: string | null;
};

export default function WarehouseReturnsPage() {
  const [invoice, setInvoice] = useState("");
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [checklist, setChecklist] = useState<ReturnChecklistState>({});
  const [returnNotes, setReturnNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [recent, setRecent] = useState<RecentReturn[]>([]);

  const loadRecent = useCallback(async () => {
    const res = await fetch("/api/warehouse/returns");
    if (!res.ok) return;
    const data = (await res.json()) as { returns: RecentReturn[] };
    setRecent(data.returns ?? []);
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  async function findInvoice(e?: React.FormEvent) {
    e?.preventDefault();
    const code = invoice.trim();
    if (!code) return;
    setLoading(true);
    setError("");
    setSuccess("");
    setLookup(null);
    try {
      const res = await fetch(
        `/api/warehouse/returns?invoice=${encodeURIComponent(code)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Invoice not found.");
        return;
      }
      const result = data as LookupResult;
      setLookup(result);
      setChecklist(emptyReturnChecklist(result.lines));
      if (!result.hasOpenReturnable) {
        setError("Nothing left to return on this invoice.");
      }
    } catch {
      setError("Could not look up invoice.");
    } finally {
      setLoading(false);
    }
  }

  async function postReturn(e: React.FormEvent) {
    e.preventDefault();
    if (!lookup) return;
    const lines = checklistToReturnLines(checklist);
    if (!lines.length) {
      setError("Select at least one product and enter how much was returned.");
      return;
    }
    setPosting(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/warehouse/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: lookup.invoiceNumber,
          notes: returnNotes.trim() || undefined,
          lines,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not post return.");
        return;
      }

      const stockWarnings = (data.stockResults ?? []).filter(
        (r: { ok: boolean; error?: string }) => !r.ok || r.error
      );
      let msg = `Return posted for ${data.invoiceNumber} (${data.lineCount} line(s)).`;
      if (stockWarnings.length) {
        msg += ` Stock notes: ${stockWarnings
          .map((r: { productName: string; error?: string }) =>
            `${r.productName}: ${r.error ?? "not updated"}`
          )
          .join("; ")}`;
      }
      setSuccess(msg);
      setLookup(null);
      setChecklist({});
      setReturnNotes("");
      setInvoice("");
      await loadRecent();
    } catch {
      setError("Could not post return.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <AppShell
      title="Customer returns"
      description="Scan or enter the original invoice, then record what came back and in what condition"
    >
      <WarehouseNav />

      {error ? (
        <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mb-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {success}
        </p>
      ) : null}

      <Card className="mb-6 max-w-3xl p-4">
        <form onSubmit={findInvoice} className="space-y-3">
          <InvoiceNumberField
            label="Original invoice #"
            required
            value={invoice}
            onChange={setInvoice}
          />
          <p className="text-xs text-zinc-500">
            Scan the barcode on the customer&apos;s invoice or type the number
            manually. We load the products from that order so you can record
            returns in m², bags, or other units from the invoice.
          </p>
          <Button type="submit" disabled={!invoice.trim() || loading}>
            {loading ? "Looking up…" : "Load invoice"}
          </Button>
        </form>
      </Card>

      {lookup ? (
        <Card className="mb-6 max-w-3xl p-4">
          <div className="mb-4 border-b border-zinc-100 pb-3">
            <p className="font-semibold text-zinc-900">{lookup.invoiceNumber}</p>
            <p className="mt-0.5 text-sm text-zinc-600">
              {lookup.customerName ?? "Customer"}
              {lookup.orderDate ? ` · ${lookup.orderDate}` : ""}
              {lookup.status ? ` · ${lookup.status.replace(/_/g, " ")}` : ""}
            </p>
          </div>

          <form onSubmit={postReturn} className="space-y-4">
            <CustomerReturnChecklist
              lines={lookup.lines}
              state={checklist}
              onChange={setChecklist}
            />

            <label className="block text-xs text-zinc-600">
              Return notes (optional)
              <textarea
                className="mt-1 w-full rounded border border-zinc-200 bg-white px-2 py-2 text-sm"
                rows={2}
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="e.g. customer over-ordered, pickup at depot"
              />
            </label>

            <Button
              type="submit"
              disabled={posting || !lookup.hasOpenReturnable}
            >
              {posting ? "Posting…" : "Post return & update stock"}
            </Button>
          </form>
        </Card>
      ) : null}

      {recent.length ? (
        <section className="max-w-3xl">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Recent returns
          </h2>
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
            {recent.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm"
              >
                <span className="font-mono font-medium text-zinc-900">
                  {row.invoiceNumber}
                </span>
                <span className="text-zinc-500">
                  {new Date(row.postedAt ?? row.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}
