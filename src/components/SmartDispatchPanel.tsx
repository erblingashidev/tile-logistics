"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Input, Select } from "@/components/ui";
import { deliveryRoundSelectOptions } from "@/lib/delivery-rounds";
import { readJsonList } from "@/lib/api/read-json-list";

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

interface Vehicle {
  id: number;
  name: string;
  plateNumber: string;
  maxPallets: number;
  maxWeightKg: number;
  loads: Array<{
    round: number;
    totals: { pallets: number; weightKg: number };
  }>;
}

interface Employee {
  id: number;
  name: string;
  roles: string[];
}

interface RouteChoice {
  vehicleId: string;
  pickerId: string;
}

interface SmartDispatchPanelProps {
  regionFilter?: string;
  defaultExpanded?: boolean;
  onApplied: () => void;
  onError: (message: string) => void;
  onWarning: (message: string) => void;
}

export function SmartDispatchPanel({
  regionFilter: regionFilterProp,
  defaultExpanded = false,
  onApplied,
  onError,
  onWarning,
}: SmartDispatchPanelProps) {
  const [deliveryRound, setDeliveryRound] = useState("1");
  const [maxOrders, setMaxOrders] = useState("6");
  const [maxDistanceKm, setMaxDistanceKm] = useState("30");
  const [region, setRegion] = useState(regionFilterProp ?? "");
  const [city, setCity] = useState("");
  const [regions, setRegions] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [plan, setPlan] = useState<DispatchPlan | null>(null);
  const [routeChoices, setRouteChoices] = useState<Record<string, RouteChoice>>(
    {}
  );
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyingRouteId, setApplyingRouteId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);

  const pickers = employees.filter((e) => e.roles.includes("picker"));
  const effectiveRegion = regionFilterProp ?? region;

  useEffect(() => {
    void (async () => {
      const [vehiclesRes, employeesRes] = await Promise.all([
        fetch("/api/vehicles?for=transport"),
        fetch("/api/employees"),
      ]);
      setVehicles(await readJsonList<Vehicle>(vehiclesRes));
      setEmployees(await readJsonList<Employee>(employeesRes));
    })();
    fetch("/api/locations")
      .then((r) => r.json())
      .then((d) => setRegions(d.regions ?? []));
  }, []);

  useEffect(() => {
    if (regionFilterProp) setRegion(regionFilterProp);
  }, [regionFilterProp]);

  useEffect(() => {
    if (!region || regionFilterProp) return;
    fetch(`/api/locations?region=${encodeURIComponent(region)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.citiesByRegion) setCities(d.citiesByRegion);
      });
  }, [region, regionFilterProp]);

  const syncRouteChoices = useCallback((recommendations: DispatchRecommendation[]) => {
    setRouteChoices((prev) => {
      const next = { ...prev };
      for (const rec of recommendations) {
        next[rec.id] = {
          vehicleId:
            prev[rec.id]?.vehicleId || String(rec.vehicleId),
          pickerId:
            prev[rec.id]?.pickerId ||
            (rec.pickerId != null ? String(rec.pickerId) : ""),
        };
      }
      return next;
    });
  }, []);

  const loadPlan = useCallback(async () => {
    setLoading(true);
    onError("");
    const params = new URLSearchParams({
      deliveryRound,
      maxOrders,
      maxDistanceKm,
    });
    if (effectiveRegion) params.set("region", effectiveRegion);
    if (city) params.set("city", city);

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
      syncRouteChoices(data.recommendations ?? []);
    } catch {
      onError("Could not load dispatch plan");
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [
    city,
    deliveryRound,
    effectiveRegion,
    maxDistanceKm,
    maxOrders,
    onError,
    syncRouteChoices,
  ]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  function routeChoice(recId: string): RouteChoice {
    const rec = plan?.recommendations.find((r) => r.id === recId);
    return (
      routeChoices[recId] ?? {
        vehicleId: rec ? String(rec.vehicleId) : "",
        pickerId: rec?.pickerId != null ? String(rec.pickerId) : "",
      }
    );
  }

  function setRouteChoice(recId: string, patch: Partial<RouteChoice>) {
    setRouteChoices((prev) => ({
      ...prev,
      [recId]: { ...routeChoice(recId), ...patch },
    }));
  }

  function routeFitsVehicle(
    rec: DispatchRecommendation,
    vehicle: Vehicle | undefined
  ) {
    if (!vehicle) {
      return { fits: false, message: "Select a truck for this route" };
    }
    const round = Number(deliveryRound);
    const load = vehicle.loads.find((l) => l.round === round);
    const usedPallets = load?.totals.pallets ?? 0;
    const usedKg = load?.totals.weightKg ?? 0;
    if (usedPallets + rec.totalPallets > vehicle.maxPallets) {
      return {
        fits: false,
        message: `Needs ${rec.totalPallets} plt · ${Math.max(0, vehicle.maxPallets - usedPallets)} free`,
      };
    }
    if (usedKg + rec.totalWeightKg > vehicle.maxWeightKg) {
      return { fits: false, message: "Weight limit on selected truck" };
    }
    return { fits: true };
  }

  function recommendationWithChoices(rec: DispatchRecommendation): DispatchRecommendation {
    const choice = routeChoice(rec.id);
    const vehicle = vehicles.find((v) => String(v.id) === choice.vehicleId);
    const picker = pickers.find((p) => String(p.id) === choice.pickerId);
    if (!vehicle) return rec;
    return {
      ...rec,
      vehicleId: vehicle.id,
      vehicleName: vehicle.name,
      plateNumber: vehicle.plateNumber,
      pickerId: picker?.id ?? null,
      pickerName: picker?.name ?? null,
    };
  }

  async function applyRecommendations(
    recommendationIds?: string[],
    ignoreWeightWarning = false,
    ignoreCraneRule = false,
    options?: { silent?: boolean }
  ): Promise<boolean> {
    if (!plan?.recommendations.length) return false;

    const ids = recommendationIds?.length
      ? new Set(recommendationIds)
      : new Set(plan.recommendations.map((r) => r.id));

    for (const rec of plan.recommendations) {
      if (!ids.has(rec.id)) continue;
      const choice = routeChoice(rec.id);
      if (!choice.vehicleId) {
        onError("Select a truck for each route before assigning.");
        return false;
      }
      const vehicle = vehicles.find((v) => String(v.id) === choice.vehicleId);
      const fit = routeFitsVehicle(rec, vehicle);
      if (!fit.fits) {
        onError(
          `${rec.routeCluster ?? rec.orders[0]?.city ?? "Route"}: ${fit.message ?? "Does not fit"}`
        );
        return false;
      }
    }

    const recommendations = plan.recommendations
      .filter((r) => ids.has(r.id))
      .map(recommendationWithChoices);

    if (!options?.silent) {
      setApplying(true);
      if (recommendationIds?.length === 1) {
        setApplyingRouteId(recommendationIds[0]);
      }
    }
    onError("");

    const res = await fetch("/api/dispatch/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recommendations,
        recommendationIds: recommendationIds,
        ignoreWeightWarning,
        ignoreCraneRule,
      }),
    });
    const data = await res.json();

    if (!options?.silent) {
      setApplying(false);
      setApplyingRouteId(null);
    }

    if (res.status === 422 && !ignoreWeightWarning) {
      if (confirm("Some routes exceed weight limits.\n\nProceed?")) {
        return applyRecommendations(
          recommendationIds,
          true,
          ignoreCraneRule,
          options
        );
      }
      return false;
    }

    if (res.status === 409 && !ignoreCraneRule) {
      if (confirm("Crane truck required.\n\nProceed?")) {
        return applyRecommendations(
          recommendationIds,
          ignoreWeightWarning,
          true,
          options
        );
      }
      return false;
    }

    if (!res.ok) {
      const firstErr = data.results
        ?.flatMap((r: { results: Array<{ error?: string }> }) => r.results)
        ?.find((x: { error?: string }) => x.error)?.error;
      onError(firstErr ?? "Could not apply dispatch plan");
      return false;
    }

    if (!options?.silent) {
      onWarning(
        `Applied ${data.applied ?? recommendations.length} route(s).`
      );
      onApplied();
      loadPlan();
      void fetch("/api/vehicles?for=transport")
        .then((r) => readJsonList<Vehicle>(r))
        .then(setVehicles);
    }
    return true;
  }

  async function applyAllRoutes() {
    if (!plan?.recommendations.length) return;
    setApplying(true);
    const ok = await applyRecommendations(undefined, false, false, {
      silent: true,
    });
    setApplying(false);
    if (ok) {
      onWarning(`Applied ${plan.recommendations.length} route(s).`);
      onApplied();
      loadPlan();
      void fetch("/api/vehicles?for=transport")
        .then((r) => readJsonList<Vehicle>(r))
        .then(setVehicles);
    }
  }

  const recommendationCount = plan?.recommendations.length ?? 0;
  const collapsedStatus = loading
    ? "Calculating…"
    : recommendationCount > 0
      ? `${recommendationCount} route${recommendationCount === 1 ? "" : "s"} ready`
      : plan?.summary.totalOrders === 0
        ? "No open orders"
        : "No routes matched";

  return (
    <section className="mb-8">
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
              <p className="text-sm font-semibold text-zinc-900">
                Route planning
              </p>
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
              onClick={() => void applyAllRoutes()}
            >
              {applying && !applyingRouteId ? "Applying…" : "Apply all routes"}
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="space-y-4 border-t border-zinc-100 px-4 py-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {!regionFilterProp && (
                <Select
                  label="Municipality"
                  value={region}
                  onChange={(e) => {
                    setRegion(e.target.value);
                    setCity("");
                  }}
                >
                  <option value="">All municipalities</option>
                  {regions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              )}
              {!regionFilterProp && (
                <Select
                  label="City / area"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                >
                  <option value="">All cities</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              )}
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
                <option value="6">6 orders</option>
                <option value="7">7 orders</option>
                <option value="8">8 orders</option>
              </Select>
              <Input
                label="Max distance between stops (km)"
                type="number"
                value={maxDistanceKm}
                onChange={(e) => setMaxDistanceKm(e.target.value)}
              />
            </div>

            <div className="flex justify-end">
              <Button variant="secondary" disabled={loading} onClick={loadPlan}>
                {loading ? "Refreshing…" : "Refresh plan"}
              </Button>
            </div>

            {loading && (
              <p className="text-sm text-zinc-500">Calculating routes…</p>
            )}

            {!loading && plan?.summary.totalOrders === 0 && (
              <Alert tone="info">
                No unassigned orders with mapped locations for these filters.
              </Alert>
            )}

            {!loading && plan && plan.skipped.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3">
                <p className="text-xs font-medium text-amber-900">
                  Not auto-planned ({plan.skipped.length})
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
                {plan.recommendations.map((rec) => {
                  const choice = routeChoice(rec.id);
                  const selectedVehicle = vehicles.find(
                    (v) => String(v.id) === choice.vehicleId
                  );
                  const fit = routeFitsVehicle(rec, selectedVehicle);
                  const busy =
                    applying && (applyingRouteId === rec.id || !applyingRouteId);

                  return (
                    <div
                      key={rec.id}
                      className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-zinc-900">
                              {rec.routeCluster ??
                                rec.orders.map((o) => o.city).join(" · ")}
                            </p>
                            {rec.hasCrane && (
                              <Badge tone="amber">Crane</Badge>
                            )}
                            {rec.reasons[0] && (
                              <span className="text-xs text-zinc-500">
                                {rec.reasons[0]}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-zinc-600">
                            Suggested: {rec.vehicleName} ({rec.plateNumber})
                            {rec.pickerName ? ` · ${rec.pickerName}` : ""}
                            {" · "}
                            {rec.totalPallets} plt · {rec.totalWeightKg.toFixed(0)}{" "}
                            kg · ~{rec.estimatedKm} km
                          </p>
                          <ul className="mt-2 space-y-1 text-sm text-zinc-700">
                            {rec.orders.map((o) => (
                              <li key={o.id}>
                                {o.invoiceNumber} — {o.customerName} ({o.city})
                                · {o.totalPallets} plt
                                {o.requiresCrane && (
                                  <span className="ml-1 text-amber-700">
                                    · crane
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
                          {!fit.fits && (
                            <p className="mt-2 text-xs text-red-600">
                              {fit.message}
                            </p>
                          )}
                        </div>
                        <div className="flex w-full flex-col gap-2 sm:w-52">
                          <Select
                            label="Truck"
                            value={choice.vehicleId}
                            onChange={(e) =>
                              setRouteChoice(rec.id, {
                                vehicleId: e.target.value,
                              })
                            }
                          >
                            <option value="">Select truck…</option>
                            {vehicles.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name} ({v.plateNumber})
                              </option>
                            ))}
                          </Select>
                          <Select
                            label="Picker"
                            value={choice.pickerId}
                            onChange={(e) =>
                              setRouteChoice(rec.id, {
                                pickerId: e.target.value,
                              })
                            }
                          >
                            <option value="">Auto / driver team</option>
                            {pickers.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </Select>
                          <Button
                            variant="secondary"
                            disabled={!choice.vehicleId || !fit.fits || busy}
                            onClick={() =>
                              void applyRecommendations([rec.id])
                            }
                          >
                            {applyingRouteId === rec.id
                              ? "Assigning…"
                              : "Assign route"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Card>
    </section>
  );
}
