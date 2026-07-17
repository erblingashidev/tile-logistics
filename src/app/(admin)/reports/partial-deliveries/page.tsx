"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageSection,
  Select,
  StatCard,
  tableClass,
} from "@/components/ui";

type Trip = {
  proofId: number;
  capturedAt: string;
  employeeName: string;
  sentPallets: number;
  sentM2: number;
  sentPieces: number;
  notes: string | null;
  photoUrl: string | null;
};

type PartialOrder = {
  id: number;
  invoiceNumber: string;
  customerName: string;
  region: string | null;
  location: string;
  orderDate: string;
  status: string;
  deliveryStageLabel: string;
  orderedPallets: number;
  orderedM2: number;
  sentPallets: number;
  sentM2: number;
  remainingPallets: number;
  remainingM2: number;
  shipmentCount: number;
  isOpen: boolean;
  assignment: {
    vehicleName: string;
    plateNumber?: string;
    deliveryRound: number;
  } | null;
  trips: Trip[];
  lastPartialAt: string | null;
};

type ReportData = {
  orders: PartialOrder[];
  summary: {
    count: number;
    openCount: number;
    completedCount: number;
    totalOrderedPallets: number;
    totalSentPallets: number;
    totalRemainingPallets: number;
    totalTrips: number;
  };
};

function fmt(n: number, digits = 1) {
  return Number.isFinite(n) ? n.toFixed(digits) : "0";
}

function fmtWhen(iso: string | null) {
  if (!iso) return "—";
  return iso.slice(0, 16).replace("T", " ");
}

export default function PartialDeliveriesReportPage() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [regions, setRegions] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    scope: "open" as "open" | "all",
    region: "",
    search: "",
  });

  useEffect(() => {
    fetch("/api/locations")
      .then((r) => r.json())
      .then((d) => setRegions(d.regions ?? []));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("scope", filters.scope);
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.set("dateTo", filters.dateTo);
      if (filters.region) params.set("region", filters.region);
      if (filters.search.trim()) params.set("search", filters.search.trim());
      const res = await fetch(`/api/reports/partial-deliveries?${params}`);
      setReport(await res.json());
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  function downloadExcel() {
    const params = new URLSearchParams();
    params.set("type", "partial-deliveries");
    params.set("scope", filters.scope);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.region) params.set("region", filters.region);
    if (filters.search.trim()) params.set("search", filters.search.trim());
    window.open(`/api/export?${params}`, "_blank");
  }

  return (
    <AppShell title="Partial deliveries">
      <div className="mb-4">
        <Link
          href="/reports"
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Reports
        </Link>
      </div>

      <PageSection title="Filters">
        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Select
              label="Scope"
              value={filters.scope}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  scope: e.target.value as "open" | "all",
                })
              }
            >
              <option value="open">Open (still remaining)</option>
              <option value="all">All with partial history</option>
            </Select>
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
              label="Region"
              value={filters.region}
              onChange={(e) =>
                setFilters({ ...filters, region: e.target.value })
              }
            >
              <option value="">All</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
            <Input
              label="Search"
              placeholder="Invoice or customer"
              value={filters.search}
              onChange={(e) =>
                setFilters({ ...filters, search: e.target.value })
              }
            />
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" onClick={load} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </Button>
            <Button variant="secondary" onClick={downloadExcel}>
              Download Excel
            </Button>
          </div>
        </Card>
      </PageSection>

      {report && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Orders" value={report.summary.count} />
            <StatCard label="Still open" value={report.summary.openCount} />
            <StatCard
              label="Remaining plt"
              value={fmt(report.summary.totalRemainingPallets)}
            />
            <StatCard label="Partial trips" value={report.summary.totalTrips} />
          </div>

          <Card className="overflow-hidden">
            <div className="border-b border-zinc-200 px-4 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Partial orders
            </div>
            {report.orders.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No partial deliveries match these filters." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className={tableClass}>
                  <thead>
                    <tr className="border-b text-left text-slate-500">
                      <th className="px-2 py-2">Invoice</th>
                      <th className="px-2 py-2">Customer</th>
                      <th className="px-2 py-2">Region</th>
                      <th className="px-2 py-2">Ordered</th>
                      <th className="px-2 py-2">Sent</th>
                      <th className="px-2 py-2">Remaining</th>
                      <th className="px-2 py-2">Trips</th>
                      <th className="px-2 py-2">Last partial</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {report.orders.map((o) => {
                      const open = expandedId === o.id;
                      return (
                        <Fragment key={o.id}>
                          <tr className="border-b align-top">
                            <td className="px-2 py-2 font-medium">
                              <Link
                                href={`/orders?search=${encodeURIComponent(o.invoiceNumber)}`}
                                className="text-zinc-900 hover:underline"
                              >
                                {o.invoiceNumber}
                              </Link>
                            </td>
                            <td className="px-2 py-2">{o.customerName}</td>
                            <td className="px-2 py-2">{o.region ?? "—"}</td>
                            <td className="px-2 py-2 whitespace-nowrap">
                              {fmt(o.orderedPallets)} plt
                              <span className="block text-xs text-zinc-500">
                                {fmt(o.orderedM2)} m²
                              </span>
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap">
                              {fmt(o.sentPallets)} plt
                              <span className="block text-xs text-zinc-500">
                                {fmt(o.sentM2)} m²
                              </span>
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap">
                              {fmt(o.remainingPallets)} plt
                              <span className="block text-xs text-zinc-500">
                                {fmt(o.remainingM2)} m²
                              </span>
                            </td>
                            <td className="px-2 py-2">{o.shipmentCount}</td>
                            <td className="px-2 py-2 whitespace-nowrap text-xs">
                              {fmtWhen(o.lastPartialAt)}
                            </td>
                            <td className="px-2 py-2">
                              <Badge tone={o.isOpen ? "amber" : "green"}>
                                {o.isOpen ? "Open" : "Done"}
                              </Badge>
                              <span className="mt-1 block text-xs text-zinc-500">
                                {o.deliveryStageLabel}
                              </span>
                            </td>
                            <td className="px-2 py-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setExpandedId(open ? null : o.id)
                                }
                              >
                                {open ? "Hide" : "Trips"}
                              </Button>
                            </td>
                          </tr>
                          {open && (
                            <tr className="border-b bg-zinc-50">
                              <td colSpan={10} className="px-3 py-3">
                                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                                  Delivery trips
                                  {o.assignment
                                    ? ` · now on ${o.assignment.vehicleName} R${o.assignment.deliveryRound}`
                                    : " · unassigned"}
                                </p>
                                <div className="overflow-x-auto rounded border border-zinc-200 bg-white">
                                  <table className={tableClass}>
                                    <thead>
                                      <tr className="border-b text-left text-slate-500">
                                        <th className="px-2 py-1.5">#</th>
                                        <th className="px-2 py-1.5">When</th>
                                        <th className="px-2 py-1.5">Driver</th>
                                        <th className="px-2 py-1.5">Sent plt</th>
                                        <th className="px-2 py-1.5">Sent m²</th>
                                        <th className="px-2 py-1.5">Pieces</th>
                                        <th className="px-2 py-1.5">Notes</th>
                                        <th className="px-2 py-1.5">Photo</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {o.trips.map((t, idx) => (
                                        <tr
                                          key={t.proofId}
                                          className="border-b last:border-0"
                                        >
                                          <td className="px-2 py-1.5">
                                            {idx + 1}
                                          </td>
                                          <td className="px-2 py-1.5 whitespace-nowrap">
                                            {fmtWhen(t.capturedAt)}
                                          </td>
                                          <td className="px-2 py-1.5">
                                            {t.employeeName}
                                          </td>
                                          <td className="px-2 py-1.5">
                                            {fmt(t.sentPallets)}
                                          </td>
                                          <td className="px-2 py-1.5">
                                            {fmt(t.sentM2)}
                                          </td>
                                          <td className="px-2 py-1.5">
                                            {t.sentPieces}
                                          </td>
                                          <td className="px-2 py-1.5 max-w-xs truncate">
                                            {t.notes || "—"}
                                          </td>
                                          <td className="px-2 py-1.5">
                                            {t.photoUrl ? (
                                              <a
                                                href={t.photoUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-sm text-zinc-700 underline"
                                              >
                                                View
                                              </a>
                                            ) : (
                                              "—"
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </AppShell>
  );
}
