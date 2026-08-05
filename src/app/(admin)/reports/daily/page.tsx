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
  delayed: number;
  partial: number;
  totalValue: number;
  groupLeaders: Array<{
    name: string;
    orders: number;
    completed: number;
    delayed: number;
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
        <span className="font-medium">For your boss each day.</span> Download
        the Excel file — it is named with the date (e.g.{" "}
        <code className="text-xs">AGIMI-daily-report-2026-08-05.xlsx</code>
        ). You work manually in Orders: assign staff, truck, and record when
        orders hit the road. Employee portal stays off until you re-enable it in
        Settings.
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
              onClick={() => {
                setReportDate(todayDateString());
              }}
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
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Orders" value={preview.orderCount} />
            <StatCard label="Completed" value={preview.completed} />
            <StatCard label="In progress" value={preview.inProgress} />
            <StatCard label="Delayed" value={preview.delayed} />
            <StatCard
              label="Total value (€)"
              value={Math.round(preview.totalValue)}
            />
          </div>

          <PageSection title="Group leaders" className="mt-8">
            <Card className="overflow-x-auto p-0">
              {preview.groupLeaders.length === 0 ? (
                <p className="p-4 text-sm text-zinc-500">
                  No group leaders assigned on these orders yet. Open an order →
                  Assign → assign a group leader under manual tracking.
                </p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-4 py-3">Leader</th>
                      <th className="px-4 py-3">Orders</th>
                      <th className="px-4 py-3">Completed</th>
                      <th className="px-4 py-3">Delayed</th>
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
                        <td className="px-4 py-3">{row.completed}</td>
                        <td className="px-4 py-3">{row.delayed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </PageSection>

          <PageSection title="What's in the Excel file" className="mt-8">
            <Card className="p-4 text-sm text-zinc-600">
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <strong>Summary</strong> — counts and total value for the day
                </li>
                <li>
                  <strong>{reportDate}</strong> — every order: invoice, created
                  date, staff assigned, truck, when it hit the road, value,
                  partial/delivered status
                </li>
                <li>
                  <strong>Group leaders</strong> — completed, delayed, and in
                  progress per leader
                </li>
                <li>
                  <strong>Delayed</strong> — overdue orders (if any)
                </li>
              </ul>
            </Card>
          </PageSection>
        </>
      ) : null}
    </AppShell>
  );
}
