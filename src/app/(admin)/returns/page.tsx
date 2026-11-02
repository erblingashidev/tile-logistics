"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  checklistToReturnLines,
  CustomerReturnChecklist,
  emptyReturnChecklist,
  formatQty,
  type ReturnChecklistState,
} from "@/components/CustomerReturnChecklist";
import { InvoiceNumberField } from "@/components/InvoiceNumberField";
import { AppShell } from "@/components/layout/AppShell";
import { Button, Card, Input } from "@/components/ui";
import {
  addDaysToDateString,
  todayDateString,
} from "@/lib/delivery-schedule";
import type {
  DailyReturnProductRow,
  DailyReturnStats,
  ReturnableLine,
} from "@/lib/services/customer-returns";

type LookupResult = {
  orderId: number;
  invoiceNumber: string;
  customerName: string | null;
  orderDate: string | null;
  status: string;
  lines: ReturnableLine[];
  hasOpenReturnable: boolean;
};

type ReturnDay = "today" | "yesterday" | "all" | "date";

function localDayRange(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  const start = new Date(year, month - 1, date);
  const end = new Date(year, month - 1, date + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

function unitLabel(unit: string) {
  if (unit === "m2") return "m²";
  if (unit === "piece") return "pcs";
  return unit;
}

function qtyCell(unit: string, qty: number) {
  if (qty <= 0) return "—";
  return `${formatQty(unit, qty)} ${unitLabel(unit)}`;
}

export default function ReturnsPage() {
  const [invoice, setInvoice] = useState("");
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [checklist, setChecklist] = useState<ReturnChecklistState>({});
  const [returnNotes, setReturnNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [workDay, setWorkDay] = useState<ReturnDay>("today");
  const [workDayDate, setWorkDayDate] = useState(() => todayDateString());
  const [rows, setRows] = useState<DailyReturnProductRow[]>([]);
  const [stats, setStats] = useState<DailyReturnStats>({
    returnCount: 0,
    productLineCount: 0,
    totalsByUnit: {},
  });
  const [reportDate, setReportDate] = useState(() => todayDateString());

  const selectedDay = useMemo(() => {
    if (workDay === "all") return "all";
    if (workDay === "yesterday") {
      return addDaysToDateString(todayDateString(), -1);
    }
    if (workDay === "date") return workDayDate || todayDateString();
    return todayDateString();
  }, [workDay, workDayDate]);

  const loadReport = useCallback(async () => {
    const params = new URLSearchParams();
    if (selectedDay === "all") {
      params.set("date", "all");
    } else {
      const range = localDayRange(selectedDay);
      params.set("date", selectedDay);
      params.set("from", range.from);
      params.set("to", range.to);
    }
    const res = await fetch(`/api/returns?${params}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      date?: string;
      report?: { rows: DailyReturnProductRow[]; stats: DailyReturnStats };
    };
    setReportDate(data.date ?? selectedDay);
    setRows(data.report?.rows ?? []);
    setStats(
      data.report?.stats ?? {
        returnCount: 0,
        productLineCount: 0,
        totalsByUnit: {},
      }
    );
  }, [selectedDay]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

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
        `/api/returns?invoice=${encodeURIComponent(code)}`
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
    const lines = checklistToReturnLines(checklist, lookup.lines);
    if (!lines.length) {
      setError(
        "Select at least one product and enter a quantity for untouched, chipped, or broken."
      );
      return;
    }
    setPosting(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/returns", {
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
        setError(data.error ?? "Could not save return.");
        return;
      }

      setSuccess(`Return recorded for ${data.invoiceNumber}.`);
      setLookup(null);
      setChecklist({});
      setReturnNotes("");
      setInvoice("");
      await loadReport();
    } catch {
      setError("Could not save return.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <AppShell
      title="Customer returns"
      description="Today’s returns are shown by default. Pick another day, or all days, to see the rest."
    >
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
            Scan or type the invoice number. Products load from that order so
            you can record how much came back and in what condition (untouched,
            chipped, or broken). This is saved as return evidence on the order
            only — stock is not changed.
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
              {posting ? "Saving…" : "Save return record"}
            </Button>
          </form>
        </Card>
      ) : null}

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {(
              [
                { id: "today", label: "Today" },
                { id: "yesterday", label: "Yesterday" },
                { id: "all", label: "All days" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setWorkDay(tab.id);
                  setWorkDayDate(todayDateString());
                }}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  workDay === tab.id
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
            <Input
              label="Pick date"
              type="date"
              value={workDay === "date" ? workDayDate : selectedDay === "all" ? workDayDate : selectedDay}
              onChange={(e) => {
                setWorkDay("date");
                setWorkDayDate(e.target.value);
              }}
              className="max-w-[160px]"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const params = new URLSearchParams({ type: "returns" });
              if (selectedDay === "all") {
                params.set("date", "all");
              } else {
                const range = localDayRange(selectedDay);
                params.set("date", selectedDay);
                params.set("from", range.from);
                params.set("to", range.to);
              }
              window.open(`/api/export?${params}`, "_blank");
            }}
          >
            Export report
          </Button>
        </div>
      </Card>

      <section className="mb-6">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">
            {reportDate === "all"
              ? "Returns report — all days"
              : `Returns report — ${reportDate}`}
          </h2>
          <p className="text-sm text-zinc-500">
            {stats.returnCount} return{stats.returnCount === 1 ? "" : "s"} ·{" "}
            {stats.productLineCount} product line
            {stats.productLineCount === 1 ? "" : "s"}
          </p>
        </div>
        {Object.keys(stats.totalsByUnit).length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {Object.entries(stats.totalsByUnit).map(([unit, totals]) => (
              <div
                key={unit}
                className="rounded border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
              >
                <span className="font-medium text-zinc-900">
                  {qtyCell(unit, totals.total)}
                </span>
                <span className="mt-0.5 block text-xs text-zinc-500">
                  Untouched {qtyCell(unit, totals.untouched)} · Chipped{" "}
                  {qtyCell(unit, totals.chipped)} · Broken{" "}
                  {qtyCell(unit, totals.broken)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        <Card className="overflow-x-auto p-0">
          {rows.length === 0 ? (
            <p className="p-4 text-sm text-zinc-500">
              {reportDate === "all"
                ? "No returns recorded."
                : `No returns recorded on ${reportDate}.`}
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Untouched</th>
                  <th className="px-4 py-3">Chipped</th>
                  <th className="px-4 py-3">Broken</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3">Recorded</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={`${row.returnId}-${row.productName}-${row.unit}`}
                    className="border-b border-zinc-100 last:border-0"
                  >
                    <td className="px-4 py-3 font-mono font-medium">
                      {row.invoiceNumber}
                    </td>
                    <td className="px-4 py-3">{row.customerName}</td>
                    <td className="px-4 py-3">{row.productName}</td>
                    <td className="px-4 py-3 tabular-nums font-medium">
                      {qtyCell(row.unit, row.total)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-zinc-600">
                      {qtyCell(row.unit, row.untouched)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-zinc-600">
                      {qtyCell(row.unit, row.chipped)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-zinc-600">
                      {qtyCell(row.unit, row.broken)}
                    </td>
                    <td className="max-w-[14rem] px-4 py-3 text-zinc-600">
                      {[row.returnNotes, row.productNotes]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-600">
                      {new Date(row.recordedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>
    </AppShell>
  );
}
