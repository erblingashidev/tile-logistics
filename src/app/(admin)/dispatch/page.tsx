"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Badge, Button, Card, Alert, PageSection, StatCard, Select } from "@/components/ui";
import { SmartDispatchPanel } from "@/components/SmartDispatchPanel";
import { deliveryRoundSelectOptions, formatDeliveryRound } from "@/lib/delivery-rounds";

const DispatchMap = dynamic(
  () =>
    import("@/components/map/DispatchMap").then((m) => m.DispatchMap),
  { ssr: false, loading: () => <Card className="p-8 text-sm text-zinc-500">Loading map…</Card> }
);

interface DispatchBoardOrder {
  id: number;
  invoiceNumber: string;
  customerName: string;
  location: string;
  region: string | null;
  totalPallets: number;
  priority: "normal" | "urgent";
  pickerName: string | null;
}

interface DispatchBoardRound {
  round: number;
  orders: DispatchBoardOrder[];
  totalPallets: number;
  maxPallets: number;
  regions: string[];
  spreadKm: number;
  pickerNames: string[];
  status: string;
  statusLabel: string;
}

interface DispatchBoardTruck {
  vehicleId: number;
  name: string;
  plateNumber: string;
  maxPallets: number;
  driverName: string | null;
  rounds: DispatchBoardRound[];
}

interface PickerWorkloadRow {
  id: number;
  name: string;
  orderCount: number;
  palletCount: number;
  status: string;
}

interface UrgentOption {
  id: string;
  vehicleId: number;
  vehicleName: string;
  plateNumber: string;
  deliveryRound: number;
  distanceToRouteKm: number;
  routeSpreadKm: number;
  almostReady: boolean;
  routeRegions: string[];
  routeInvoices: string[];
  reasons: string[];
}

interface BoardData {
  pickerWorkload: PickerWorkloadRow[];
  unassignedUrgent: DispatchBoardOrder[];
  unassignedCount: number;
  trucks: DispatchBoardTruck[];
}

function roundTone(status: string) {
  if (status === "ready") return "green" as const;
  if (status === "departed") return "blue" as const;
  if (status === "loading") return "amber" as const;
  return "slate" as const;
}

function pickerBalanceHint(rows: PickerWorkloadRow[]): string | null {
  if (rows.length < 2) return null;
  const counts = rows.map((r) => r.orderCount);
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  if (max - min <= 2) return null;
  const heavy = rows.filter((r) => r.orderCount === max).map((r) => r.name);
  const light = rows.filter((r) => r.orderCount === min).map((r) => r.name);
  return `${heavy.join(", ")} has ${max} orders vs ${light.join(", ")} (${min}) — consider rebalancing`;
}

export default function DispatchPage() {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [mapRefreshKey, setMapRefreshKey] = useState(0);
  const [mapDeliveryRound, setMapDeliveryRound] = useState("1");
  const [showPlanOnMap, setShowPlanOnMap] = useState(false);
  const [urgentOptions, setUrgentOptions] = useState<
    Record<number, UrgentOption[]>
  >({});
  const [busyOrderId, setBusyOrderId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/dispatch/board", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not load dispatch board");
        return;
      }
      setBoard(data);
    } catch {
      setError("Could not load dispatch board");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  async function loadUrgentOptions(orderId: number) {
    const res = await fetch(`/api/dispatch/urgent?orderId=${orderId}`);
    const data = await res.json();
    if (res.ok && data.options) {
      setUrgentOptions((prev) => ({ ...prev, [orderId]: data.options }));
    } else {
      setError(data.error ?? "No urgent route found");
    }
  }

  async function applyUrgent(
    orderId: number,
    opt: UrgentOption,
    ignoreWeight = false
  ) {
    setBusyOrderId(orderId);
    setError("");
    const res = await fetch("/api/dispatch/urgent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId,
        vehicleId: opt.vehicleId,
        deliveryRound: opt.deliveryRound,
        ignoreWeightWarning: ignoreWeight,
      }),
    });
    const data = await res.json();
    setBusyOrderId(null);
    if (res.status === 422 && !ignoreWeight) {
      if (confirm(`${data.error ?? "Weight limit exceeded"}\n\nProceed?`)) {
        await applyUrgent(orderId, opt, true);
      }
      return;
    }
    if (!res.ok) {
      setError(data.error ?? "Could not assign urgent order");
      return;
    }
    setMessage(`Assigned to ${opt.vehicleName} · R${opt.deliveryRound}`);
    setTimeout(() => setMessage(""), 3000);
    setUrgentOptions((prev) => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
    load();
  }

  const balanceHint = board ? pickerBalanceHint(board.pickerWorkload) : null;
  const maxPickerOrders = board
    ? Math.max(0, ...board.pickerWorkload.map((p) => p.orderCount))
    : 0;

  return (
    <AppShell
      title="Dispatch board"
      description="Live fleet load and assignments."
    >
      {message && (
        <div className="mb-4">
          <Alert tone="warning">{message}</Alert>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={load} disabled={loading}>
          Refresh
        </Button>
        <Link href="/orders">
          <Button variant="ghost">Orders · assign</Button>
        </Link>
        <Link href="/routes">
          <Button variant="ghost">Route planner</Button>
        </Link>
        <Link href="/map">
          <Button variant="ghost">Full order map</Button>
        </Link>
      </div>

      {board && (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Unassigned orders" value={board.unassignedCount} />
            <StatCard
              label="Urgent waiting"
              value={board.unassignedUrgent.length}
            />
            <StatCard label="Trucks on board" value={board.trucks.length} />
            <StatCard
              label="Pickers active"
              value={board.pickerWorkload.length}
            />
          </div>

          <PageSection title="Dispatch map">
            <div className="mb-3 flex flex-wrap items-end gap-3">
              <Select
                label="Delivery round"
                value={mapDeliveryRound}
                onChange={(e) => setMapDeliveryRound(e.target.value)}
              >
                {deliveryRoundSelectOptions().map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <label className="flex items-center gap-2 pb-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={showPlanOnMap}
                  onChange={(e) => setShowPlanOnMap(e.target.checked)}
                  className="rounded border-zinc-300"
                />
                Show suggested routes on map
              </label>
            </div>
            <DispatchMap
              deliveryRound={Number(mapDeliveryRound)}
              showPlan={showPlanOnMap}
              includePlan={showPlanOnMap}
              refreshKey={mapRefreshKey}
            />
          </PageSection>

          <SmartDispatchPanel
            onApplied={() => {
              load();
              setMapRefreshKey((k) => k + 1);
            }}
            onError={setError}
            onWarning={setMessage}
          />

          <PageSection title="Picker workload">
            {balanceHint && (
              <Alert tone="warning">
                {balanceHint}
              </Alert>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {board.pickerWorkload.map((p) => (
                <Card key={p.id} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-zinc-900">{p.name}</p>
                    <Badge tone={p.status === "available" ? "green" : "amber"}>
                      {p.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-zinc-600">
                    {p.orderCount} active orders · {p.palletCount} pallets
                  </p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{
                        width: `${
                          maxPickerOrders > 0
                            ? Math.min(100, (p.orderCount / maxPickerOrders) * 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </Card>
              ))}
              {board.pickerWorkload.length === 0 && (
                <p className="text-sm text-zinc-500">No pickers in system.</p>
              )}
            </div>
          </PageSection>

          {board.unassignedUrgent.length > 0 && (
            <PageSection title="Urgent — needs a route">
              <div className="space-y-3">
                {board.unassignedUrgent.map((o) => (
                  <Card key={o.id} className="border-red-200 bg-red-50/40 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-zinc-900">
                          {o.invoiceNumber} · {o.customerName}
                        </p>
                        <p className="text-sm text-zinc-600">
                          {o.location} ({o.region}) · {o.totalPallets} plt
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        className="text-xs"
                        disabled={busyOrderId === o.id}
                        onClick={() => loadUrgentOptions(o.id)}
                      >
                        Suggest truck
                      </Button>
                    </div>
                    {(urgentOptions[o.id] ?? []).length > 0 && (
                      <ul className="mt-3 space-y-2">
                        {urgentOptions[o.id].map((opt) => (
                          <li
                            key={opt.id}
                            className="rounded-lg border border-white bg-white/80 p-3 text-sm"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-medium">
                                {opt.vehicleName} ·{" "}
                                {formatDeliveryRound(opt.deliveryRound, "short")}
                                {opt.almostReady && (
                                  <span className="ml-2 text-green-700">
                                    · almost ready
                                  </span>
                                )}
                              </p>
                              <Button
                                className="text-xs"
                                disabled={busyOrderId === o.id}
                                onClick={() => applyUrgent(o.id, opt)}
                              >
                                Assign here
                              </Button>
                            </div>
                            <p className="mt-1 text-xs text-zinc-600">
                              {opt.reasons[0]}
                            </p>
                            {opt.routeInvoices.length > 0 && (
                              <p className="mt-1 text-xs text-zinc-500">
                                With: {opt.routeInvoices.join(", ")} · spread{" "}
                                {opt.routeSpreadKm} km
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                ))}
              </div>
            </PageSection>
          )}

          <PageSection
            title={`Trucks & rounds · ${board.unassignedCount} unassigned orders total`}
          >
            {loading && !board.trucks.length ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : (
              <div className="space-y-4">
                {board.trucks.map((truck) => (
                  <Card key={truck.vehicleId} className="overflow-hidden">
                    <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-zinc-900">
                            {truck.name}{" "}
                            <span className="font-normal text-zinc-500">
                              ({truck.plateNumber})
                            </span>
                          </p>
                          <p className="text-xs text-zinc-500">
                            {truck.driverName
                              ? `Driver: ${truck.driverName}`
                              : "No driver linked"}{" "}
                            · max {truck.maxPallets} plt
                          </p>
                        </div>
                        <Link
                          href={`/orders?vehicleId=${truck.vehicleId}`}
                          className="text-xs text-blue-600 underline"
                        >
                          Focus on Orders
                        </Link>
                      </div>
                    </div>
                    <div className="grid gap-0 lg:grid-cols-2 xl:grid-cols-3">
                      {truck.rounds.map((round) => (
                        <div
                          key={round.round}
                          className="border-b border-r border-zinc-100 p-4 last:border-b-0"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold">
                              {formatDeliveryRound(round.round, "short")}
                            </p>
                            <Badge tone={roundTone(round.status)}>
                              {round.statusLabel}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-zinc-600">
                            {round.totalPallets} / {round.maxPallets} plt
                            {round.spreadKm > 0 &&
                              ` · route spread ${round.spreadKm} km`}
                          </p>
                          {round.regions.length > 0 && (
                            <p className="mt-1 text-xs text-zinc-500">
                              Areas: {round.regions.join(" · ")}
                            </p>
                          )}
                          {round.pickerNames.length > 0 && (
                            <p className="mt-1 text-xs text-zinc-500">
                              Pickers: {round.pickerNames.join(", ")}
                            </p>
                          )}
                          {round.orders.length === 0 ? null : (
                            <ul className="mt-3 space-y-1.5">
                              {round.orders.map((o) => (
                                <li
                                  key={o.id}
                                  className="rounded border border-zinc-100 bg-zinc-50/50 px-2 py-1.5 text-xs"
                                >
                                  <span className="font-medium">
                                    {o.invoiceNumber}
                                  </span>
                                  {o.priority === "urgent" && (
                                    <Badge tone="red">
                                      URGENT
                                    </Badge>
                                  )}
                                  <span className="text-zinc-600">
                                    {" "}
                                    · {o.totalPallets} plt · {o.location}
                                  </span>
                                  {o.pickerName && (
                                    <span className="block text-zinc-500">
                                      Picker: {o.pickerName}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </PageSection>
        </>
      )}
    </AppShell>
  );
}
