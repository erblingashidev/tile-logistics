"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  LoadingState,
  PageSection,
  StatCard,
} from "@/components/ui";
import { todayDateString } from "@/lib/delivery-schedule";

interface OrderPreview {
  id: number;
  invoiceNumber: string;
  customerName: string;
  location: string;
  deliveryDate: string;
  daysOverdue: number;
  delayed: boolean;
  pipeline: string;
  status: string;
  pallets: number;
  value: number;
  picker: string;
}

interface ReturnPreviewRow {
  returnId: number;
  invoiceNumber: string;
  customerName: string;
  productName: string;
  unit: string;
  total: number;
  untouched: number;
  chipped: number;
  broken: number;
  returnNotes: string | null;
  productNotes: string | null;
  recordedAt: string;
}

interface DailyPreview {
  reportDate: string;
  orderCount: number;
  totalInReport: number;
  completed: number;
  inProgress: number;
  completedToday: number;
  delayed: number;
  partial: number;
  scheduled: number;
  scheduledWaiting: number;
  scheduledCompleted: number;
  completionRate: number;
  delayedShareOfOpen: number;
  totalValue: number;
  waitingValue: number;
  completedValue: number;
  completedTodayValue: number;
  scheduledValue: number;
  delayedValue: number;
  dayOrders: OrderPreview[];
  scheduledOrders: OrderPreview[];
  delayedOrders: OrderPreview[];
  returns: {
    returnCount: number;
    productLineCount: number;
    totalsByUnit: Record<
      string,
      { total: number; untouched: number; chipped: number; broken: number }
    >;
    rows: ReturnPreviewRow[];
  };
  pickers: Array<{
    name: string;
    orders: number;
    assignedToday: number;
    completed: number;
    completedToday: number;
    waiting: number;
    delayed: number;
    partial: number;
    valueCompleted: number;
    valueCompletedToday: number;
    valueWaiting: number;
    firstAssigned: string;
    lastCompleted: string;
  }>;
}

function formatReturnQty(unit: string, qty: number): string {
  if (qty <= 0) return "—";
  if (unit === "m2") return `${Math.round(qty * 100) / 100} m²`;
  if (unit === "piece") return `${Math.round(qty)} pcs`;
  return String(Math.round(qty * 10) / 10);
}

function pipelineTone(
  pipeline: string
): "slate" | "green" | "amber" | "blue" | "red" {
  if (pipeline === "Completed") return "green";
  if (pipeline === "Delayed") return "amber";
  if (pipeline === "Partial") return "blue";
  if (pipeline === "Cancelled") return "red";
  return "slate";
}

function BarChart({
  title,
  bars,
}: {
  title: string;
  bars: Array<{ label: string; value: number; color: string }>;
}) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {title}
      </p>
      <div className="mt-4 space-y-3">
        {bars.map((bar) => (
          <div key={bar.label}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="text-zinc-700">{bar.label}</span>
              <span className="tabular-nums font-semibold text-zinc-900">
                {bar.value}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded bg-zinc-100">
              <div
                className={`h-full rounded ${bar.color}`}
                style={{ width: `${Math.round((bar.value / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function StackedShare({
  title,
  parts,
}: {
  title: string;
  parts: Array<{ label: string; value: number; color: string }>;
}) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {title}
      </p>
      <div className="mt-4 flex h-4 overflow-hidden rounded">
        {parts.map((part) =>
          part.value > 0 ? (
            <div
              key={part.label}
              className={part.color}
              style={{ width: `${(part.value / total) * 100}%` }}
              title={`${part.label}: ${part.value}`}
            />
          ) : null
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {parts.map((part) => (
          <div key={part.label} className="flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${part.color}`} />
            <span className="text-zinc-600">{part.label}</span>
            <span className="tabular-nums font-medium text-zinc-900">
              {part.value}
            </span>
            <span className="tabular-nums text-zinc-400">
              ({Math.round((part.value / total) * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function OrdersTable({
  rows,
  empty,
  showOverdue,
}: {
  rows: OrderPreview[];
  empty: string;
  showOverdue?: boolean;
}) {
  if (!rows.length) {
    return <p className="p-4 text-sm text-zinc-500">{empty}</p>;
  }
  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
        <tr>
          <th className="px-4 py-3">Type</th>
          <th className="px-4 py-3">Invoice</th>
          <th className="px-4 py-3">Customer</th>
          <th className="px-4 py-3">Location</th>
          <th className="px-4 py-3">Delivery date</th>
          {showOverdue ? <th className="px-4 py-3">Days overdue</th> : null}
          <th className="px-4 py-3">Pipeline</th>
          <th className="px-4 py-3">Picker</th>
          <th className="px-4 py-3">Pallets</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            className={`border-b border-zinc-100 last:border-0 ${
              row.delayed ? "bg-amber-50/40" : ""
            }`}
          >
            <td className="px-4 py-3">
              {row.delayed ? (
                <Badge tone="amber">Delayed</Badge>
              ) : (
                <Badge tone="blue">This day</Badge>
              )}
            </td>
            <td className="px-4 py-3 font-medium">
              <Link
                href={`/orders?search=${encodeURIComponent(row.invoiceNumber)}&workDay=all`}
                className="text-blue-700 underline hover:text-blue-900"
              >
                {row.invoiceNumber}
              </Link>
            </td>
            <td className="px-4 py-3">{row.customerName}</td>
            <td className="px-4 py-3 text-zinc-600">{row.location}</td>
            <td className="whitespace-nowrap px-4 py-3 tabular-nums">
              {row.deliveryDate}
            </td>
            {showOverdue ? (
              <td className="px-4 py-3 font-medium text-amber-800">
                {row.daysOverdue || "—"}
              </td>
            ) : null}
            <td className="px-4 py-3">
              <Badge tone={pipelineTone(row.pipeline)}>{row.pipeline}</Badge>
            </td>
            <td className="px-4 py-3 text-zinc-600">{row.picker || "—"}</td>
            <td className="px-4 py-3 tabular-nums">{row.pallets}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function DailyReportsPage() {
  const [reportDate, setReportDate] = useState(() => todayDateString());
  const [preview, setPreview] = useState<DailyPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/reports/daily?date=${encodeURIComponent(reportDate)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) {
        setPreview(null);
        setError(data.error ?? "Could not load preview");
        return;
      }
      setPreview(data);
    } catch {
      setPreview(null);
      setError("Could not load preview");
    } finally {
      setLoading(false);
    }
  }, [reportDate]);

  useEffect(() => {
    load();
  }, [load]);

  function downloadExcel() {
    window.open(
      `/api/export?type=daily&date=${encodeURIComponent(reportDate)}`,
      "_blank"
    );
  }

  const workloadParts = useMemo(() => {
    if (!preview) return [];
    return [
      {
        label: "Scheduled this day",
        value: preview.scheduled,
        color: "bg-blue-500",
      },
      {
        label: "Delayed backlog",
        value: preview.delayed,
        color: "bg-amber-500",
      },
    ];
  }, [preview]);

  return (
    <AppShell title="Daily report">
      <div className="mb-4">
        <Link
          href="/reports"
          className="text-sm font-medium text-zinc-600 underline hover:text-zinc-900"
        >
          ← All reports
        </Link>
      </div>

      <PageSection title="Report date">
        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <Input
              label="Date"
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
            />
            <Button variant="secondary" onClick={() => load()}>
              Refresh
            </Button>
            <Button onClick={downloadExcel}>
              Download Excel — {reportDate}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setReportDate(todayDateString())}
            >
              Today
            </Button>
          </div>
        </Card>
      </PageSection>

      {error && (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {loading ? (
        <LoadingState title="Loading…" />
      ) : preview ? (
        <>
          {preview.delayed > 0 ? (
            <div className="mt-4">
              <Alert tone="warning">
                {preview.scheduled} order
                {preview.scheduled === 1 ? "" : "s"} scheduled for{" "}
                {preview.reportDate}. {preview.delayed} delayed order
                {preview.delayed === 1 ? "" : "s"} from earlier days are listed
                separately (not counted as this day’s orders).
              </Alert>
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Scheduled this day"
              value={preview.scheduled}
              hint="Orders with delivery date = report date"
            />
            <StatCard
              label="Delayed backlog"
              value={preview.delayed}
              hint="Open orders from earlier days"
            />
            <StatCard
              label="Completed today"
              value={preview.completedToday}
              hint="Finished on this report date"
            />
            <StatCard
              label="Day completion"
              value={`${preview.completionRate}%`}
              hint={`${preview.scheduledCompleted} of ${preview.scheduled} scheduled`}
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Scheduled waiting"
              value={preview.scheduledWaiting}
            />
            <StatCard label="Partial" value={preview.partial} />
            <StatCard
              label="Customer returns"
              value={preview.returns?.returnCount ?? 0}
              hint={
                preview.returns?.productLineCount
                  ? `${preview.returns.productLineCount} product line(s)`
                  : "Recorded on this date"
              }
            />
            <StatCard
              label="Delayed of open"
              value={`${preview.delayedShareOfOpen}%`}
              hint={`${preview.delayed} of ${preview.inProgress} still open`}
            />
            <StatCard
              label="Value scheduled (€)"
              value={Math.round(preview.scheduledValue ?? 0)}
            />
          </div>

          <PageSection title="KPIs" className="mt-8">
            <div className="grid gap-4 lg:grid-cols-2">
              <StackedShare
                title="Workload: this day vs delayed"
                parts={workloadParts}
              />
              <BarChart
                title="Day pipeline"
                bars={[
                  {
                    label: "Scheduled waiting",
                    value: preview.scheduledWaiting,
                    color: "bg-zinc-500",
                  },
                  {
                    label: "Completed today",
                    value: preview.completedToday,
                    color: "bg-emerald-500",
                  },
                  {
                    label: "Delayed backlog",
                    value: preview.delayed,
                    color: "bg-amber-500",
                  },
                  {
                    label: "Partial",
                    value: preview.partial,
                    color: "bg-sky-500",
                  },
                ]}
              />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <BarChart
                title="Value (€)"
                bars={[
                  {
                    label: "Scheduled",
                    value: Math.round(preview.scheduledValue ?? 0),
                    color: "bg-blue-500",
                  },
                  {
                    label: "Delayed",
                    value: Math.round(preview.delayedValue ?? 0),
                    color: "bg-amber-500",
                  },
                  {
                    label: "Completed today",
                    value: Math.round(preview.completedTodayValue),
                    color: "bg-emerald-500",
                  },
                  {
                    label: "Waiting (all open)",
                    value: Math.round(preview.waitingValue),
                    color: "bg-zinc-500",
                  },
                ]}
              />
              {(preview.pickers ?? []).some(
                (p) => p.delayed > 0 || p.completedToday > 0
              ) ? (
                <BarChart
                  title="Pickers — delayed vs done today"
                  bars={(preview.pickers ?? [])
                    .filter((p) => p.delayed > 0 || p.completedToday > 0)
                    .slice(0, 8)
                    .map((p) => ({
                      label: `${p.name} (delay ${p.delayed} / done ${p.completedToday})`,
                      value: p.delayed + p.completedToday,
                      color:
                        p.delayed > p.completedToday
                          ? "bg-amber-500"
                          : "bg-emerald-500",
                    }))}
                />
              ) : (
                <Card className="p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Pickers — delayed vs done today
                  </p>
                  <p className="mt-4 text-sm text-zinc-500">
                    No picker delayed or completed-today activity for this date.
                  </p>
                </Card>
              )}
            </div>
          </PageSection>

          <PageSection title="Orders scheduled this day" className="mt-8">
            <Card className="overflow-x-auto p-0">
              <OrdersTable
                rows={preview.scheduledOrders ?? []}
                empty="No orders scheduled for this date."
              />
            </Card>
          </PageSection>

          <PageSection title="Delayed backlog" className="mt-8">
            <Card className="overflow-x-auto p-0">
              <OrdersTable
                rows={preview.delayedOrders ?? []}
                empty="No delayed orders for this date."
                showOverdue
              />
            </Card>
          </PageSection>

          <PageSection title="Customer returns" className="mt-8">
            <Card className="overflow-x-auto p-0">
              {!preview.returns?.rows?.length ? (
                <p className="p-4 text-sm text-zinc-500">
                  No customer returns recorded on this date.
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
                    {preview.returns.rows.map((row) => (
                      <tr
                        key={`${row.returnId}-${row.productName}`}
                        className="border-b border-zinc-100 last:border-0"
                      >
                        <td className="px-4 py-3 font-medium">
                          <Link
                            href={`/orders?search=${encodeURIComponent(row.invoiceNumber)}&workDay=all`}
                            className="font-mono text-blue-700 underline hover:text-blue-900"
                          >
                            {row.invoiceNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3">{row.customerName}</td>
                        <td className="px-4 py-3">{row.productName}</td>
                        <td className="px-4 py-3 tabular-nums font-medium">
                          {formatReturnQty(row.unit, row.total)}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-zinc-600">
                          {formatReturnQty(row.unit, row.untouched)}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-zinc-600">
                          {formatReturnQty(row.unit, row.chipped)}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-zinc-600">
                          {formatReturnQty(row.unit, row.broken)}
                        </td>
                        <td className="max-w-[14rem] px-4 py-3 text-zinc-600">
                          {[row.returnNotes, row.productNotes]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-zinc-600">
                          {row.recordedAt.replace("T", " ").slice(0, 16)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </PageSection>

          <PageSection title="Pickers" className="mt-8">
            <Card className="overflow-x-auto p-0">
              {preview.pickers.length === 0 ? (
                <p className="p-4 text-sm text-zinc-500">No pickers assigned.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-4 py-3">Picker</th>
                      <th className="px-4 py-3">Orders</th>
                      <th className="px-4 py-3">Assigned today</th>
                      <th className="px-4 py-3">Completed</th>
                      <th className="px-4 py-3">Done today</th>
                      <th className="px-4 py-3">Waiting</th>
                      <th className="px-4 py-3">Delayed</th>
                      <th className="px-4 py-3">Value done (€)</th>
                      <th className="px-4 py-3">Value today (€)</th>
                      <th className="px-4 py-3">First assigned</th>
                      <th className="px-4 py-3">Last completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.pickers.map((row) => (
                      <tr
                        key={row.name}
                        className="border-b border-zinc-100 last:border-0"
                      >
                        <td className="px-4 py-3 font-medium">{row.name}</td>
                        <td className="px-4 py-3">{row.orders}</td>
                        <td className="px-4 py-3">{row.assignedToday}</td>
                        <td className="px-4 py-3">{row.completed}</td>
                        <td className="px-4 py-3">{row.completedToday}</td>
                        <td className="px-4 py-3">{row.waiting}</td>
                        <td className="px-4 py-3">
                          {row.delayed > 0 ? (
                            <Badge tone="amber">{row.delayed}</Badge>
                          ) : (
                            0
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {Math.round(Number(row.valueCompleted))}
                        </td>
                        <td className="px-4 py-3">
                          {Math.round(Number(row.valueCompletedToday))}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-zinc-600">
                          {row.firstAssigned || "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-zinc-600">
                          {row.lastCompleted || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </PageSection>
        </>
      ) : null}
    </AppShell>
  );
}
