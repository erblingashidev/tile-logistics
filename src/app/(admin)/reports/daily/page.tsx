"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import {
  Alert,
  Button,
  Card,
  Input,
  LoadingState,
  PageSection,
  StatCard,
} from "@/components/ui";
import { todayDateString } from "@/lib/delivery-schedule";

interface DailyPreview {
  reportDate: string;
  orderCount: number;
  completed: number;
  inProgress: number;
  completedToday: number;
  delayed: number;
  partial: number;
  scheduled: number;
  totalValue: number;
  waitingValue: number;
  completedTodayValue: number;
  groupLeaders: Array<{
    name: string;
    orders: number;
    completed: number;
    completedToday: number;
    waiting: number;
    delayed: number;
    valueTotal: number;
    valueCompleted: number;
  }>;
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

      <Alert tone="info">
        <span className="font-medium">Daily report for management.</span>{" "}
        Includes all open orders, anything that happened on the selected date
        (assignments, hit the road, delivered), plus group leader and picker
        performance with order values. Record steps manually in Orders after
        you hand invoices to staff.
      </Alert>

      <PageSection title="Report date" className="mt-6">
        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <Input
              label="Date"
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
            />
            <Button variant="secondary" onClick={() => load()}>
              Refresh preview
            </Button>
            <Button onClick={downloadExcel}>
              Download Excel for {reportDate}
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
        <LoadingState title="Loading preview…" />
      ) : preview ? (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Orders in report" value={preview.orderCount} />
            <StatCard label="Still waiting" value={preview.inProgress} />
            <StatCard label="Completed today" value={preview.completedToday} />
            <StatCard label="Delayed" value={preview.delayed} />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Scheduled this date" value={preview.scheduled} />
            <StatCard label="Partial deliveries" value={preview.partial} />
            <StatCard
              label="Value waiting (€)"
              value={Math.round(preview.waitingValue)}
            />
            <StatCard
              label="Completed today (€)"
              value={Math.round(preview.completedTodayValue)}
            />
          </div>

          <PageSection title="Group leaders" className="mt-8">
            <Card className="overflow-x-auto p-0">
              {preview.groupLeaders.length === 0 ? (
                <p className="p-4 text-sm text-zinc-500">
                  No group leaders assigned yet. In Orders → Assign →{" "}
                  <strong>Assign staff</strong>, pick a group leader after you
                  give the invoice to them.
                </p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-4 py-3">Leader</th>
                      <th className="px-4 py-3">Orders</th>
                      <th className="px-4 py-3">Waiting</th>
                      <th className="px-4 py-3">Done today</th>
                      <th className="px-4 py-3">Value (€)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.groupLeaders.map((row) => (
                      <tr
                        key={row.name}
                        className="border-b border-zinc-100 last:border-0"
                      >
                        <td className="px-4 py-3 font-medium">{row.name}</td>
                        <td className="px-4 py-3">{row.orders}</td>
                        <td className="px-4 py-3">{row.waiting}</td>
                        <td className="px-4 py-3">{row.completedToday}</td>
                        <td className="px-4 py-3">
                          {Math.round(row.valueTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </PageSection>

          <PageSection title="Excel workbook sheets" className="mt-8">
            <Card className="p-4 text-sm text-zinc-600">
              <ol className="list-decimal space-y-2 pl-5">
                <li>
                  <strong>Dashboard</strong> — executive summary your boss reads
                  first
                </li>
                <li>
                  <strong>All orders</strong> — invoice, value, who is assigned,
                  when truck/staff assigned, when it hit the road, delivered
                </li>
                <li>
                  <strong>Waiting</strong> — pipeline not yet done
                </li>
                <li>
                  <strong>Completed today</strong> — finished on this date
                </li>
                <li>
                  <strong>Activity log</strong> — chronological log of assignments
                  and milestones recorded this day
                </li>
                <li>
                  <strong>Group leaders & Pickers</strong> — orders done, waiting,
                  delayed, and € value per person
                </li>
                <li>
                  <strong>Delayed</strong> — overdue orders (if any)
                </li>
              </ol>
            </Card>
          </PageSection>
        </>
      ) : null}
    </AppShell>
  );
}
