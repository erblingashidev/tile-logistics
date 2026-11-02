"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import {
  AdministrationLedgerTable,
  type AdministrationTransaction,
} from "@/components/administration/AdministrationLedgerTable";
import {
  Alert,
  Card,
  EmptyState,
  Input,
  PageSection,
  Select,
} from "@/components/ui";
import type { LogCategory } from "@/lib/log-messages";
import { format, isToday, isYesterday, parseISO } from "date-fns";

type LogScope = "all" | "logistics" | "administration";

interface LogEntry {
  id: number;
  category: LogCategory;
  message: string;
  createdAt: string;
  source?: "activity" | "administration";
  detailsParsed?: Record<string, unknown> | null;
}

const SCOPE_FILTERS: { id: LogScope; label: string; hint: string }[] = [
  { id: "all", label: "All logs", hint: "Logistics and cash register" },
  {
    id: "logistics",
    label: "Logistics",
    hint: "Orders, vehicles, staff, deliveries",
  },
  {
    id: "administration",
    label: "Administration",
    hint: "Cash register audit and entries",
  },
];

const LOGISTICS_FILTERS: { id: LogCategory | "all"; label: string }[] = [
  { id: "all", label: "All logistics" },
  { id: "orders", label: "Orders" },
  { id: "vehicles", label: "Vehicles" },
  { id: "employees", label: "Employees" },
  { id: "deliveries", label: "Deliveries" },
  { id: "system", label: "System" },
];

function dayLabel(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "d MMM yyyy");
}

function dateRangeParams(dateFrom: string, dateTo: string) {
  return {
    from: dateFrom ? `${dateFrom}T00:00:00.000Z` : undefined,
    to: dateTo ? `${dateTo}T23:59:59.999Z` : undefined,
  };
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [dateFrom, setDateFrom] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [dateTo, setDateTo] = useState("");
  const [scope, setScope] = useState<LogScope>("all");
  const [logisticsCategory, setLogisticsCategory] = useState<
    LogCategory | "all"
  >("all");
  const [search, setSearch] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [employees, setEmployees] = useState<Array<{ id: number; name: string }>>(
    []
  );

  const [registerEntries, setRegisterEntries] = useState<
    AdministrationTransaction[]
  >([]);
  const [canApprove, setCanApprove] = useState(false);
  const [canAdministration, setCanAdministration] = useState(false);
  const [ledgerBusy, setLedgerBusy] = useState(false);
  const [error, setError] = useState("");

  const showRegisterLedger =
    scope === "administration" || scope === "all";

  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then(setEmployees);
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const perms: string[] = data?.permissions ?? [];
        setCanApprove(
          perms.includes("administration:approve") || data?.user?.role === "admin"
        );
        setCanAdministration(
          data?.user?.role === "admin" ||
            perms.includes("administration:read") ||
            perms.includes("administration:write")
        );
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("scope", scope);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (scope === "logistics" || scope === "all") {
      if (logisticsCategory !== "all") {
        params.set("category", logisticsCategory);
      }
    }
    if (search.trim()) params.set("search", search.trim());
    if (employeeId) params.set("employeeId", employeeId);
    const res = await fetch(`/api/logs?${params}`);
    setLogs(await res.json());
  }, [dateFrom, dateTo, scope, logisticsCategory, search, employeeId]);

  const loadRegisterEntries = useCallback(async () => {
    if (!canAdministration || !showRegisterLedger) {
      setRegisterEntries([]);
      return;
    }
    const { from, to } = dateRangeParams(dateFrom, dateTo);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (search.trim()) params.set("search", search.trim());
    const res = await fetch(`/api/administration/transactions?${params}`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = await res.json();
    setRegisterEntries(data.transactions ?? []);
  }, [canAdministration, showRegisterLedger, dateFrom, dateTo, search]);

  const refreshRegister = useCallback(async () => {
    await Promise.all([load(), loadRegisterEntries()]);
  }, [load, loadRegisterEntries]);

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
      void loadRegisterEntries();
    }, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, loadRegisterEntries, search]);

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
    <AppShell title="Logs">
      {error ? (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}

      <PageSection title="Filters">
        <Card className="space-y-4 p-4">
          <div>
            <span className="mb-1 block text-xs font-medium text-zinc-600">
              Log source
            </span>
            <div className="flex flex-wrap gap-2">
              {SCOPE_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  title={f.hint}
                  onClick={() => {
                    setScope(f.id);
                    if (f.id === "administration") {
                      setLogisticsCategory("all");
                    }
                  }}
                  className={`rounded border px-3 py-1.5 text-sm ${
                    scope === f.id
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {scope === "logistics" || scope === "all" ? (
            <div>
              <span className="mb-1 block text-xs font-medium text-zinc-600">
                Logistics type
              </span>
              <div className="flex flex-wrap gap-1">
                {LOGISTICS_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setLogisticsCategory(f.id)}
                    className={`rounded border px-2.5 py-1 text-xs ${
                      logisticsCategory === f.id
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

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
              placeholder="Invoice, customer, register action…"
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
          </div>
        </Card>
      </PageSection>

      <PageSection
        title={
          scope === "administration"
            ? "Cash register audit trail"
            : "Activity timeline"
        }
      >
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
                      key={`${log.source ?? "activity"}-${log.id}`}
                      className="flex gap-4 px-4 py-3 text-sm hover:bg-zinc-50/50"
                    >
                      <span className="w-12 shrink-0 tabular-nums text-zinc-400">
                        {format(new Date(log.createdAt), "HH:mm")}
                      </span>
                      <span className="min-w-0 flex-1 text-zinc-800">
                        {log.message}
                      </span>
                      {log.source === "administration" ? (
                        <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-900">
                          Register
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </Card>
      </PageSection>

      {showRegisterLedger && canAdministration ? (
        <PageSection title="Cash register entries" className="mt-8">
          <p className="-mt-2 mb-3 text-sm text-zinc-600">
            Edit or remove ledger lines here. Management can change closed-shift
            entries; every change is recorded in the audit trail above.
          </p>
          <AdministrationLedgerTable
            transactions={registerEntries}
            canApprove={canApprove}
            busy={ledgerBusy}
            onBusyChange={setLedgerBusy}
            onError={setError}
            onUpdated={refreshRegister}
            emptyTitle="No register entries in this date range."
          />
        </PageSection>
      ) : null}
    </AppShell>
  );
}
