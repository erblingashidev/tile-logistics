"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Select } from "@/components/ui";
import { deliveryRoundSelectOptions } from "@/lib/delivery-rounds";

interface DispatchOrderStop {
  id: number;
  invoiceNumber: string;
  customerName: string;
  city: string;
  totalPallets: number;
  requiresCrane: boolean;
}

interface DispatchRecommendation {
  id: string;
  deliveryRound: number;
  orderIds: number[];
  orders: DispatchOrderStop[];
  vehicleId: number;
  vehicleName: string;
  plateNumber: string;
  hasCrane: boolean;
  pickerId: number | null;
  pickerName: string | null;
  driverId: number | null;
  driverName: string | null;
  totalPallets: number;
  totalWeightKg: number;
  estimatedKm: number;
  costScore: number;
  routeCluster?: string;
  reasons: string[];
  warnings: string[];
}

interface DispatchPlan {
  deliveryRound: number;
  recommendations: DispatchRecommendation[];
  skipped: Array<{ orderId: number; invoiceNumber: string; reason: string }>;
  summary: {
    totalOrders: number;
    plannedOrders: number;
    craneRoutes: number;
    estimatedTotalKm: number;
    estimatedCostScore: number;
  };
}

interface SmartDispatchPanelProps {
  regionFilter?: string;
  onApplied: () => void;
  onError: (message: string) => void;
  onWarning: (message: string) => void;
}

export function SmartDispatchPanel({
  regionFilter,
  onApplied,
  onError,
  onWarning,
}: SmartDispatchPanelProps) {
  const [deliveryRound, setDeliveryRound] = useState("1");
  const [maxOrders, setMaxOrders] = useState("6");
  const [maxDistanceKm, setMaxDistanceKm] = useState("30");
  const [plan, setPlan] = useState<DispatchPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const loadPlan = useCallback(async () => {
    setLoading(true);
    onError("");
    const params = new URLSearchParams({
      deliveryRound,
      maxOrders,
      maxDistanceKm,
    });
    if (regionFilter) params.set("region", regionFilter);

    try {
      const res = await fetch(`/api/dispatch/recommend?${params}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        onError(data.error ?? "Could not load dispatch plan");
        setPlan(null);
        return;
      }
      setPlan(data);
    } catch {
      onError("Could not load dispatch plan");
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [deliveryRound, maxDistanceKm, maxOrders, onError, regionFilter]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  async function applyRecommendations(
    recommendationIds?: string[],
    ignoreWeightWarning = false,
    ignoreCraneRule = false
  ) {
    if (!plan?.recommendations.length) return;

    setApplying(true);
    onError("");
    const res = await fetch("/api/dispatch/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recommendations: plan.recommendations,
        recommendationIds,
        ignoreWeightWarning,
        ignoreCraneRule,
      }),
    });
    const data = await res.json();
    setApplying(false);

    if (res.status === 422 && !ignoreWeightWarning) {
      if (
        confirm(
          "Some routes exceed weight limits.\n\nProceed?"
        )
      ) {
        await applyRecommendations(recommendationIds, true, ignoreCraneRule);
      }
      return;
    }

    if (res.status === 409 && !ignoreCraneRule) {
      if (
        confirm(
          "Crane truck required.\n\nProceed?"
        )
      ) {
        await applyRecommendations(recommendationIds, ignoreWeightWarning, true);
      }
      return;
    }

    if (!res.ok) {
      const firstErr = data.results
        ?.flatMap((r: { results: Array<{ error?: string }> }) => r.results)
        ?.find((x: { error?: string }) => x.error)?.error;
      onError(firstErr ?? "Could not apply dispatch plan");
      return;
    }

    onWarning(
      `Applied ${data.applied ?? recommendationIds?.length ?? plan.recommendations.length} route(s).`
    );
    onApplied();
    loadPlan();
  }

  const unassignedCount = plan?.summary.totalOrders ?? 0;
  const recommendationCount = plan?.recommendations.length ?? 0;

  const collapsedStatus = loading
    ? "Calculating…"
    : recommendationCount > 0
      ? `${recommendationCount} route${recommendationCount === 1 ? "" : "s"} ready`
      : unassignedCount === 0
        ? "No open orders"
        : "No routes matched";

  return (
    <section className="mt-8">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            <span
              className={`inline-block text-xs text-zinc-400 transition-transform ${
                expanded ? "rotate-90" : ""
              }`}
              aria-hidden
            >
              ▸
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-900">Route suggestions</p>
              {!expanded && (
                <p className="truncate text-xs text-zinc-500">{collapsedStatus}</p>
              )}
            </div>
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              className="text-xs sm:hidden"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Hide" : "Show"}
            </Button>
            <Button
              disabled={applying || loading || recommendationCount === 0}
              onClick={() => applyRecommendations()}
            >
              {applying ? "Applying…" : "Apply all routes"}
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="space-y-4 border-t border-zinc-100 px-4 py-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="grid flex-1 gap-3 sm:grid-cols-3">
                <Select
                  label="Delivery round"
                  value={deliveryRound}
                  onChange={(e) => setDeliveryRound(e.target.value)}
                >
                  {deliveryRoundSelectOptions().map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Max stops per route"
                  value={maxOrders}
                  onChange={(e) => setMaxOrders(e.target.value)}
                >
                  <option value="2">2 orders</option>
                  <option value="3">3 orders</option>
                  <option value="4">4 orders</option>
                  <option value="5">5 orders</option>
                  <option value="6">6 orders (default)</option>
                  <option value="7">7 orders</option>
                  <option value="8">8 orders</option>
                </Select>
                <Select
                  label="Max distance between stops (km)"
                  value={maxDistanceKm}
                  onChange={(e) => setMaxDistanceKm(e.target.value)}
                >
                  <option value="15">15 km</option>
                  <option value="20">20 km</option>
                  <option value="25">25 km</option>
                  <option value="30">30 km</option>
                  <option value="35">35 km</option>
                </Select>
              </div>
              <Button variant="secondary" disabled={loading} onClick={loadPlan}>
                {loading ? "Refreshing…" : "Refresh"}
              </Button>
            </div>

            {loading && (
              <p className="text-sm text-zinc-500">Calculating routes…</p>
            )}

            {!loading && unassignedCount === 0 && (
              <Alert tone="info">No unassigned orders with mapped locations.</Alert>
            )}

            {!loading && plan && plan.skipped.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3">
                <p className="text-xs font-medium text-amber-900">
                  Could not plan ({plan.skipped.length})
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-amber-800">
                  {plan.skipped.map((s) => (
                    <li key={s.orderId}>
                      {s.invoiceNumber}: {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!loading && plan && plan.recommendations.length > 0 && (
              <div className="space-y-3">
                {plan.recommendations.map((rec) => (
                  <div
                    key={rec.id}
                    className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-zinc-900">
                            {rec.vehicleName}{" "}
                            <span className="font-normal text-zinc-500">
                              ({rec.plateNumber})
                            </span>
                          </p>
                          {rec.hasCrane && (
                            <Badge tone="amber">Crane required</Badge>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-zinc-600">
                          {rec.routeCluster ? `${rec.routeCluster} · ` : ""}
                          {rec.pickerName ? `Picker ${rec.pickerName}` : "No picker"}
                          {rec.driverName ? ` · Driver ${rec.driverName}` : ""}
                          {" · "}
                          {rec.totalPallets} plt · {rec.totalWeightKg.toFixed(0)} kg
                          {" · ~"}
                          {rec.estimatedKm} km
                        </p>
                        <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                          {rec.orders.map((o) => (
                            <li key={o.id}>
                              {o.invoiceNumber} — {o.customerName} ({o.city}) ·{" "}
                              {o.totalPallets} plt
                              {o.requiresCrane && (
                                <span className="ml-1 text-amber-700">
                                  · jumbo / crane
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                        {rec.warnings.length > 0 && (
                          <ul className="mt-2 space-y-0.5 text-xs text-amber-700">
                            {rec.warnings.map((w) => (
                              <li key={w}>⚠ {w}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <Button
                        variant="secondary"
                        disabled={applying}
                        onClick={() => applyRecommendations([rec.id])}
                      >
                        Apply route
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}
      </Card>
    </section>
  );
}
