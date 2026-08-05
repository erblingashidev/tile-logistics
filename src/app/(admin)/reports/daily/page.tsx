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
  completedValue: number;
  completedTodayValue: number;
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
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Orders" value={preview.orderCount} />
            <StatCard label="Waiting" value={preview.inProgress} />
            <StatCard label="Completed today" value={preview.completedToday} />
            <StatCard label="Delayed" value={preview.delayed} />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Scheduled" value={preview.scheduled} />
            <StatCard label="Partial" value={preview.partial} />
            <StatCard
              label="Value waiting (€)"
              value={Math.round(preview.waitingValue)}
            />
            <StatCard
              label="Completed today (€)"
              value={Math.round(preview.completedTodayValue)}
            />
          </div>

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
                        <td className="px-4 py-3">{row.delayed}</td>
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
