"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge, Button, Card, Input, PageSection, Select, StatCard, tableClass } from "@/components/ui";

interface ReportOrder {
  id: number;
  invoiceNumber: string;
  customerName: string;
  region?: string | null;
  location: string;
  orderDate: string;
  status: string;
  totalM2: number;
  totalPallets: number;
  totalWeightKg: number;
  price: number;
  assignment?: { vehicleName: string; deliveryRound: number } | null;
}

interface ReportData {
  orders: ReportOrder[];
  summary: {
    count: number;
    totalM2: number;
    totalPallets: number;
    totalPrice: number;
    byStatus: Record<string, number>;
  };
}

export default function ReportsPage() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [filters, setFilters] = useState({
    dateFrom: new Date().toISOString().slice(0, 10),
    dateTo: "",
    hourFrom: "",
    hourTo: "",
    employeeId: "",
    pickerId: "",
    driverId: "",
  });
  const [employees, setEmployees] = useState<
    Array<{ id: number; name: string; roles: string[] }>
  >([]);

  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then(setEmployees);
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.hourFrom) params.set("hourFrom", filters.hourFrom);
    if (filters.hourTo) params.set("hourTo", filters.hourTo);
    if (filters.employeeId) params.set("employeeId", filters.employeeId);
    if (filters.pickerId) params.set("pickerId", filters.pickerId);
    if (filters.driverId) params.set("driverId", filters.driverId);
    const res = await fetch(`/api/reports?${params}`);
    setReport(await res.json());
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AppShell title="Reports">
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Link href="/reports/partial-deliveries">
          <Card className="h-full p-5 transition hover:border-zinc-400">
            <p className="font-semibold text-zinc-900">Partial deliveries</p>
            <p className="mt-1 text-sm text-zinc-600">
              Open remaining qty, trip history, and Excel export for partial
              orders.
            </p>
          </Card>
        </Link>
        <Card className="h-full p-5 border-dashed">
          <p className="font-semibold text-zinc-900">Order analytics</p>
          <p className="mt-1 text-sm text-zinc-600">
            Filter by date, employee, and hour — table and Excel below.
          </p>
        </Card>
      </div>

      <PageSection title="Filters">
        <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="From date"
            type="date"
            value={filters.dateFrom}
            onChange={(e) =>
              setFilters({ ...filters, dateFrom: e.target.value })
            }
          />
          <Input
            label="To date"
            type="date"
            value={filters.dateTo}
            onChange={(e) =>
              setFilters({ ...filters, dateTo: e.target.value })
            }
          />
          <Select
            label="Employee"
            value={filters.employeeId}
            onChange={(e) =>
              setFilters({ ...filters, employeeId: e.target.value })
            }
          >
            <option value="">All</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
          <Select
            label="Picker"
            value={filters.pickerId}
            onChange={(e) =>
              setFilters({ ...filters, pickerId: e.target.value })
            }
          >
            <option value="">All</option>
            {employees
              .filter((e) => e.roles.includes("picker"))
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
          </Select>
          <Input
            label="Hour from (0-23)"
            type="number"
            min={0}
            max={23}
            value={filters.hourFrom}
            onChange={(e) =>
              setFilters({ ...filters, hourFrom: e.target.value })
            }
          />
          <Input
            label="Hour to (0-23)"
            type="number"
            min={0}
            max={23}
            value={filters.hourTo}
            onChange={(e) =>
              setFilters({ ...filters, hourTo: e.target.value })
            }
          />
          <Select
            label="Driver"
            value={filters.driverId}
            onChange={(e) =>
              setFilters({ ...filters, driverId: e.target.value })
            }
          >
            <option value="">All</option>
            {employees
              .filter((e) => e.roles.includes("driver"))
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
          </Select>
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" onClick={load}>
            Refresh
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              const params = new URLSearchParams();
              if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
              if (filters.dateTo) params.set("dateTo", filters.dateTo);
              window.open(`/api/export?${params}`, "_blank");
            }}
          >
            Download Excel
          </Button>
        </div>
        </Card>
      </PageSection>

      {report && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-4">
            <StatCard label="Orders" value={report.summary.count} />
            <StatCard
              label="Total m²"
              value={report.summary.totalM2.toFixed(1)}
            />
            <StatCard label="Total pallets" value={report.summary.totalPallets} />
            <StatCard
              label="Total price"
              value={report.summary.totalPrice.toFixed(2)}
            />
          </div>

          <Card className="overflow-hidden">
            <div className="border-b border-zinc-200 px-4 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Orders
            </div>
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="px-2 py-2">Invoice</th>
                    <th className="px-2 py-2">Customer</th>
                    <th className="px-2 py-2">Region</th>
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">m²</th>
                    <th className="px-2 py-2">Pallets</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Vehicle</th>
                  </tr>
                </thead>
                <tbody>
                  {report.orders.map((o) => (
                    <tr key={o.id} className="border-b">
                      <td className="px-2 py-2">{o.invoiceNumber}</td>
                      <td className="px-2 py-2">{o.customerName}</td>
                      <td className="px-2 py-2">
                        {o.region ?? "—"}
                      </td>
                      <td className="px-2 py-2">{o.orderDate}</td>
                      <td className="px-2 py-2">{o.totalM2.toFixed(1)}</td>
                      <td className="px-2 py-2">{o.totalPallets}</td>
                      <td className="px-2 py-2">
                        <Badge tone="blue">{o.status}</Badge>
                      </td>
                      <td className="px-2 py-2">
                        {o.assignment
                          ? `${o.assignment.vehicleName} (R${o.assignment.deliveryRound})`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </AppShell>
  );
}
