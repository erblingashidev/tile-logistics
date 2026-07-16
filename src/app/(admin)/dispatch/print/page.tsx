"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui";
import { formatDeliveryRound } from "@/lib/delivery-rounds";
import type {
  DispatchPrintEmployeeGroup,
  DispatchPrintOrder,
  DispatchPrintPlanRoute,
  DispatchPrintSheet,
  DispatchPrintTruck,
} from "@/lib/services/dispatch-print";

function loadStatusLabel(status: string) {
  if (status === "loaded") return "Loaded";
  if (status === "load_skipped") return "Skipped";
  return "Pending";
}

function prepStatusLabel(status: string) {
  return status === "prepared" ? "Prepared" : "Pending";
}

function OrderTable({
  orders,
  showStop = false,
}: {
  orders: DispatchPrintOrder[];
  showStop?: boolean;
}) {
  if (orders.length === 0) return null;
  return (
    <table className="dispatch-print-table w-full border-collapse text-sm">
      <thead>
        <tr>
          {showStop && <th className="text-right w-8">#</th>}
          <th className="text-left">Invoice</th>
          <th className="text-left">Customer</th>
          <th className="text-left">Region / location</th>
          <th className="text-right">Plt</th>
          <th className="text-right">kg</th>
          <th className="text-left">Preferred truck</th>
          <th className="text-left">Status</th>
          <th className="text-left">Pick</th>
          <th className="text-left">Load</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => (
          <tr key={order.id}>
            {showStop && (
              <td className="text-right tabular-nums text-zinc-500">
                {order.stopSequence ?? "—"}
              </td>
            )}
            <td className="font-mono">{order.invoiceNumber}</td>
            <td>{order.customerName}</td>
            <td>
              {[order.region, order.location].filter(Boolean).join(" · ")}
            </td>
            <td className="text-right tabular-nums">
              {order.totalPallets.toFixed(1)}
            </td>
            <td className="text-right tabular-nums">
              {Math.round(order.totalWeightKg)}
            </td>
            <td className="text-xs">
              {order.preferredTruckName ?? "—"}
            </td>
            <td>{order.deliveryStageLabel}</td>
            <td>{prepStatusLabel(order.prepStatus)}</td>
            <td>{loadStatusLabel(order.loadStatus)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TruckSection({ truck }: { truck: DispatchPrintTruck }) {
  return (
    <section className="dispatch-print-group break-inside-avoid">
      <header className="dispatch-print-group-header">
        <div>
          <h2 className="text-lg font-semibold">
            {truck.name}{" "}
            <span className="font-normal text-zinc-600">({truck.plateNumber})</span>
          </h2>
          <p className="text-sm text-zinc-600">
            {truck.driverName ? `Driver: ${truck.driverName}` : "No driver assigned"}
            {" · "}
            {truck.totalPallets.toFixed(1)} plt · {Math.round(truck.totalWeightKg)} kg
          </p>
        </div>
      </header>
      {truck.rounds.map((round) => (
        <div key={round.round} className="mb-4">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-700">
            {formatDeliveryRound(round.round, "short")}
            {" · "}
            {round.totalPallets.toFixed(1)} plt · {Math.round(round.totalWeightKg)} kg
            {round.driverName ? ` · Driver: ${round.driverName}` : ""}
            {round.pickerNames.length > 0
              ? ` · Pickers: ${round.pickerNames.join(", ")}`
              : ""}
            {round.routeClusters.length > 0
              ? ` · ${round.routeClusters.join(", ")}`
              : ""}
          </h3>
          <OrderTable orders={round.orders} showStop />
        </div>
      ))}
    </section>
  );
}

function SuggestedRouteSection({ route }: { route: DispatchPrintPlanRoute }) {
  return (
    <div className="mb-3 rounded border border-dashed border-blue-200 bg-blue-50/40 p-3 break-inside-avoid">
      <h4 className="text-sm font-semibold text-blue-900">
        {route.roundLabel} · {route.vehicleName} ({route.plateNumber})
      </h4>
      <p className="mt-1 text-xs text-blue-800">
        {route.routeCluster} · {route.orderCount} stops · {route.totalPallets.toFixed(1)} plt · ~
        {route.estimatedKm} km
        {route.pickerName ? ` · Picker: ${route.pickerName}` : ""}
        {route.driverName ? ` · Driver: ${route.driverName}` : ""}
      </p>
      <ul className="mt-2 space-y-1 text-xs text-zinc-700">
        {route.orders.map((o) => (
          <li key={o.invoiceNumber}>
            <span className="font-mono">{o.invoiceNumber}</span> — {o.customerName}
            {" · "}
            {[o.region, o.location].filter(Boolean).join(" · ")}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmployeeSection({ group }: { group: DispatchPrintEmployeeGroup }) {
  return (
    <section className="dispatch-print-group break-inside-avoid">
      <header className="dispatch-print-group-header">
        <h2 className="text-lg font-semibold">
          {group.employeeName}{" "}
          <span className="font-normal capitalize text-zinc-600">
            ({group.role})
          </span>
        </h2>
        <p className="text-sm text-zinc-600">
          {group.orders.length} order{group.orders.length === 1 ? "" : "s"} ·{" "}
          {group.totalPallets.toFixed(1)} plt · {Math.round(group.totalWeightKg)} kg
        </p>
      </header>
      <OrderTable orders={group.orders} />
    </section>
  );
}

export default function DispatchPrintPage() {
  const searchParams = useSearchParams();
  const query = useMemo(() => searchParams.toString(), [searchParams]);
  const groupBy = searchParams.get("groupBy") === "employee" ? "employee" : "vehicle";

  const [sheet, setSheet] = useState<DispatchPrintSheet | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/dispatch/print?${query}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not load print sheet");
        return;
      }
      setSheet(data);
    } catch {
      setError("Could not load print sheet");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleGroupBy() {
    const params = new URLSearchParams(query);
    if (groupBy === "vehicle") {
      params.set("groupBy", "employee");
    } else {
      params.delete("groupBy");
    }
    window.location.search = params.toString();
  }

  return (
    <>
      <style jsx global>{`
        @media screen {
          body {
            background: #f4f4f5;
          }
        }

        @page {
          size: A4 portrait;
          margin: 12mm;
        }

        @media print {
          .dispatch-print-toolbar {
            display: none !important;
          }
          body {
            background: white;
          }
          .dispatch-print-page {
            box-shadow: none !important;
            margin: 0 !important;
            max-width: none !important;
            padding: 0 !important;
          }
        }

        .dispatch-print-page {
          max-width: 210mm;
          margin: 0 auto;
          background: white;
          padding: 16mm;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        }

        .dispatch-print-table th,
        .dispatch-print-table td {
          border: 1px solid #d4d4d8;
          padding: 5px 6px;
          vertical-align: top;
          font-size: 11px;
        }

        .dispatch-print-table th {
          background: #f4f4f5;
          font-weight: 600;
        }

        .dispatch-print-table tbody tr:nth-child(even) {
          background: #fafafa;
        }

        .dispatch-print-group {
          margin-bottom: 24px;
        }

        .dispatch-print-group-header {
          border-bottom: 2px solid #18181b;
          margin-bottom: 12px;
          padding-bottom: 8px;
        }

        .dispatch-print-summary-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }

        .dispatch-print-summary-card {
          border: 1px solid #e4e4e7;
          border-radius: 6px;
          padding: 8px 10px;
          background: #fafafa;
        }
      `}</style>

      <div className="dispatch-print-toolbar sticky top-0 z-10 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
          <Button onClick={() => window.print()}>Print</Button>
          <Button variant="secondary" onClick={toggleGroupBy}>
            {groupBy === "vehicle" ? "By employee" : "By truck"}
          </Button>
          <Link href="/dispatch">
            <Button variant="ghost">Back to dispatch</Button>
          </Link>
          <Link href={`/orders${query ? `?${query}` : ""}`}>
            <Button variant="ghost">Orders</Button>
          </Link>
        </div>
      </div>

      <main className="dispatch-print-page py-6">
        {loading && <p className="text-sm text-zinc-500">Loading dispatch sheet…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {sheet && (
          <>
            <header className="mb-6 border-b border-zinc-200 pb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                Warehouse dispatch sheet — full day
              </p>
              <h1 className="mt-1 text-2xl font-bold text-zinc-900">
                {sheet.workDayLabel}
              </h1>
              <p className="mt-1 text-sm text-zinc-600">
                Grouped by {groupBy === "vehicle" ? "truck & delivery round" : "employee"}
                {" · "}
                Generated {new Date(sheet.generatedAt).toLocaleString()}
              </p>
              <div className="dispatch-print-summary-grid mt-4">
                <div className="dispatch-print-summary-card">
                  <p className="text-[10px] font-semibold uppercase text-zinc-500">Assigned</p>
                  <p className="text-lg font-semibold">{sheet.daySummary.assignedOrders}</p>
                </div>
                <div className="dispatch-print-summary-card">
                  <p className="text-[10px] font-semibold uppercase text-zinc-500">Unassigned</p>
                  <p className="text-lg font-semibold text-amber-800">
                    {sheet.daySummary.unassignedOrders}
                  </p>
                </div>
                <div className="dispatch-print-summary-card">
                  <p className="text-[10px] font-semibold uppercase text-zinc-500">Trucks / rounds</p>
                  <p className="text-lg font-semibold">
                    {sheet.daySummary.trucksUsed} / {sheet.daySummary.roundsPlanned}
                  </p>
                </div>
                <div className="dispatch-print-summary-card">
                  <p className="text-[10px] font-semibold uppercase text-zinc-500">Total pallets</p>
                  <p className="text-lg font-semibold">
                    {sheet.daySummary.totalPallets.toFixed(1)}
                  </p>
                </div>
                <div className="dispatch-print-summary-card">
                  <p className="text-[10px] font-semibold uppercase text-zinc-500">Total kg</p>
                  <p className="text-lg font-semibold">
                    {Math.round(sheet.daySummary.totalWeightKg)}
                  </p>
                </div>
                <div className="dispatch-print-summary-card">
                  <p className="text-[10px] font-semibold uppercase text-zinc-500">Suggested routes</p>
                  <p className="text-lg font-semibold">{sheet.suggestedRoutes.length}</p>
                </div>
              </div>
            </header>

            {groupBy === "vehicle" ? (
              <>
                {sheet.unassigned.length > 0 && (
                  <section className="dispatch-print-group break-inside-avoid">
                    <header className="dispatch-print-group-header">
                      <h2 className="text-lg font-semibold text-amber-800">
                        Unassigned orders
                      </h2>
                      <p className="text-sm text-zinc-600">
                        {sheet.unassigned.length} order
                        {sheet.unassigned.length === 1 ? "" : "s"} ·{" "}
                        {sheet.unassigned
                          .reduce((sum, order) => sum + order.totalPallets, 0)
                          .toFixed(1)}{" "}
                        plt ·{" "}
                        {Math.round(
                          sheet.unassigned.reduce(
                            (sum, order) => sum + order.totalWeightKg,
                            0
                          )
                        )}{" "}
                        kg
                      </p>
                    </header>
                    <OrderTable orders={sheet.unassigned} />
                  </section>
                )}

                {sheet.suggestedRoutes.length > 0 && (
                  <section className="dispatch-print-group break-inside-avoid">
                    <header className="dispatch-print-group-header">
                      <h2 className="text-lg font-semibold text-blue-900">
                        Suggested route clusters (unassigned)
                      </h2>
                      <p className="text-sm text-zinc-600">
                        Auto-plan for up to 3 rounds — apply via Smart Dispatch on the board
                      </p>
                    </header>
                    {sheet.suggestedRoutes.map((route) => (
                      <SuggestedRouteSection key={route.id} route={route} />
                    ))}
                  </section>
                )}

                {sheet.trucks.map((truck) => (
                  <TruckSection key={truck.vehicleId} truck={truck} />
                ))}

                {sheet.trucks.length === 0 &&
                  sheet.unassigned.length === 0 &&
                  sheet.suggestedRoutes.length === 0 && (
                    <p className="text-sm text-zinc-500">No orders for this work day.</p>
                  )}
              </>
            ) : sheet.byEmployee.length > 0 ? (
              sheet.byEmployee.map((group) => (
                <EmployeeSection
                  key={`${group.role}-${group.employeeName}`}
                  group={group}
                />
              ))
            ) : (
              <p className="text-sm text-zinc-500">No assigned orders for this work day.</p>
            )}
          </>
        )}
      </main>
    </>
  );
}
