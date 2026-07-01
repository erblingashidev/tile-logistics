"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Card,
  EmptyState,
  Input,
  PageSection,
  Select,
} from "@/components/ui";
import type { LogCategory } from "@/lib/log-messages";
import { format, isToday, isYesterday, parseISO } from "date-fns";

interface LogEntry {
  id: number;
  category: LogCategory;
  message: string;
  createdAt: string;
  detailsParsed?: Record<string, unknown> | null;
}

const FILTERS: { id: LogCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "orders", label: "Orders" },
  { id: "vehicles", label: "Vehicles" },
  { id: "employees", label: "Employees" },
  { id: "deliveries", label: "Deliveries" },
];

function dayLabel(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "d MMM yyyy");
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [dateFrom, setDateFrom] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [dateTo, setDateTo] = useState("");
  const [category, setCategory] = useState<LogCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [employees, setEmployees] = useState<Array<{ id: number; name: string }>>([]);

  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then(setEmployees);
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (category !== "all") params.set("category", category);
    if (search.trim()) params.set("search", search.trim());
    if (employeeId) params.set("employeeId", employeeId);
    const res = await fetch(`/api/logs?${params}`);
    setLogs(await res.json());
  }, [dateFrom, dateTo, category, search, employeeId]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, LogEntry[]>();
    for (const log of logs) {
      const key = log.createdAt.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(log);
    }
    return [...map.entries()];
  }, [logs]);

  return (
    <AppShell title="Logs" description="System activity and changes.">
      <PageSection title="Filters">
        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              label="From"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <Input
              label="To"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
            <Input
              label="Search"
              placeholder="Invoice, vehicle, employee…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              label="Employee"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">All employees</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
            <div>
              <span className="mb-1 block text-xs font-medium text-zinc-600">
                Type
              </span>
              <div className="flex flex-wrap gap-1">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setCategory(f.id)}
                    className={`rounded border px-2.5 py-1 text-xs ${
                      category === f.id
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </PageSection>

      <Card className="overflow-hidden">
        {grouped.length === 0 ? (
          <EmptyState title="No activity for this period." />
        ) : (
          grouped.map(([day, dayLogs]) => (
            <div key={day}>
              <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-500">
                {dayLabel(day + "T12:00:00")}
              </div>
              <ul className="divide-y divide-zinc-100">
                {dayLogs.map((log) => (
                  <li
                    key={log.id}
                    className="flex gap-4 px-4 py-3 text-sm hover:bg-zinc-50/50"
                  >
                    <span className="w-12 shrink-0 tabular-nums text-zinc-400">
                      {format(new Date(log.createdAt), "HH:mm")}
                    </span>
                    <span className="text-zinc-800">{log.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </Card>
    </AppShell>
  );
}
