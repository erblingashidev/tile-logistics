"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import {
  Alert,
  Button,
  Card,
  Input,
  PageSection,
  Select,
} from "@/components/ui";
import { deliveryRoundSelectOptions } from "@/lib/delivery-rounds";
import { readJsonList } from "@/lib/api/read-json-list";
import { SmartDispatchPanel } from "@/components/SmartDispatchPanel";

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

interface RoutePlan {
  id: string;
  city: string;
  region: string;
  totalPallets: number;
  totalWeightKg: number;
  maxDistanceKm: number;
  maxDistanceFromWarehouseKm: number;
  fitsVehicle: boolean;
  vehicleMessage?: string;
  orders: Array<{
    id: number;
    invoiceNumber: string;
    customerName: string;
    location: string;
    region?: string;
    totalPallets: number;
  }>;
}

export default function RoutesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [plans, setPlans] = useState<RoutePlan[]>([]);
  const [filters, setFilters] = useState({
    region: "",
    city: "",
    vehicleId: "",
    employeeId: "",
    pickerId: "",
    driverId: "",
    deliveryRound: "1",
    maxOrders: "3",
    maxDistanceKm: "30",
  });
  const [employees, setEmployees] = useState<
    Array<{ id: number; name: string; roles: string[] }>
  >([]);
  const [warning, setWarning] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [assigningPlanId, setAssigningPlanId] = useState<string | null>(null);
  const [assigningAll, setAssigningAll] = useState(false);
  const [planChoices, setPlanChoices] = useState<
    Record<string, { vehicleId: string; pickerId: string }>
  >({});

  const pickers = employees.filter((e) => e.roles.includes("picker"));

  useEffect(() => {
    void (async () => {
      const [vehiclesRes, employeesRes] = await Promise.all([
        fetch("/api/vehicles"),
        fetch("/api/employees"),
      ]);
      setVehicles(await readJsonList<Vehicle>(vehiclesRes));
      setEmployees(
        await readJsonList<{ id: number; name: string; roles: string[] }>(
          employeesRes
        )
      );
    })();
    fetch("/api/locations")
      .then((r) => r.json())
      .then((d) => {
        setRegions(d.regions ?? []);
        setCities(d.cities ?? []);
      });
  }, []);

  useEffect(() => {
    if (!filters.region) return;
    fetch(`/api/locations?region=${encodeURIComponent(filters.region)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.citiesByRegion) setCities(d.citiesByRegion);
      });
  }, [filters.region]);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (filters.region) params.set("region", filters.region);
    if (filters.city) params.set("city", filters.city);
    if (filters.employeeId) params.set("employeeId", filters.employeeId);
    if (filters.pickerId) params.set("pickerId", filters.pickerId);
    if (filters.driverId) params.set("driverId", filters.driverId);
    if (filters.vehicleId) params.set("vehicleId", filters.vehicleId);
    params.set("deliveryRound", filters.deliveryRound);
    params.set("maxOrders", filters.maxOrders);
    params.set("maxDistanceKm", filters.maxDistanceKm);
    params.set("unassigned", "true");
    const res = await fetch(`/api/routes?${params}`);
    setPlans(await res.json());
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    setPlanChoices((prev) => {
      const next = { ...prev };
      for (const plan of plans) {
        if (!next[plan.id]) {
          next[plan.id] = {
            vehicleId: filters.vehicleId,
            pickerId: filters.pickerId,
          };
        }
      }
      return next;
    });
  }, [plans, filters.pickerId, filters.vehicleId]);

  function planChoice(planId: string) {
    return (
      planChoices[planId] ?? {
        vehicleId: filters.vehicleId,
        pickerId: filters.pickerId,
      }
    );
  }

  function setPlanChoice(
    planId: string,
    patch: Partial<{ vehicleId: string; pickerId: string }>
  ) {
    setPlanChoices((prev) => ({
      ...prev,
      [planId]: { ...planChoice(planId), ...patch },
    }));
  }

  function routeFitsVehicle(plan: RoutePlan, vehicle: Vehicle | undefined) {
    if (!vehicle) {
      return { fits: false, message: "Select a truck for this route" };
    }
    const round = Number(filters.deliveryRound);
    const load = vehicle.loads.find((l) => l.round === round);
    const usedPallets = load?.totals.pallets ?? 0;
    const usedKg = load?.totals.weightKg ?? 0;
    if (usedPallets + plan.totalPallets > vehicle.maxPallets) {
      return {
        fits: false,
        message: `Needs ${plan.totalPallets} plt · ${Math.max(0, vehicle.maxPallets - usedPallets)} free on ${vehicle.name}`,
      };
    }
    if (usedKg + plan.totalWeightKg > vehicle.maxWeightKg) {
      return {
        fits: false,
        message: `Weight limit on ${vehicle.name}`,
      };
    }
    return { fits: true };
  }

  const selectedVehicle = vehicles.find(
    (v) => String(v.id) === filters.vehicleId
  );
  const roundLoad = selectedVehicle?.loads.find(
    (l) => l.round === Number(filters.deliveryRound)
  );

  async function assignRoute(
    plan: RoutePlan,
    ignoreWeight = false,
    ignoreCrane = false,
    options?: { silent?: boolean }
  ): Promise<boolean> {
    const choice = planChoice(plan.id);
    const vehicleId = Number(choice.vehicleId);
    if (!vehicleId) {
      setError("Select a truck for this route.");
      return false;
    }
    setError("");
    if (!options?.silent) {
      setAssigningPlanId(plan.id);
    }
    const res = await fetch("/api/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleId,
        deliveryRound: Number(filters.deliveryRound),
        orderIds: plan.orders.map((o) => o.id),
        pickerId: choice.pickerId ? Number(choice.pickerId) : undefined,
        ignoreWeightWarning: ignoreWeight,
        ignoreCraneRule: ignoreCrane,
      }),
    });
    const data = await res.json();
    if (!options?.silent) {
      setAssigningPlanId(null);
    }
    if (res.status === 409 && !ignoreCrane) {
      const craneErr = data.results?.find(
        (r: { requiresCrane?: boolean; error?: string }) => r.requiresCrane
      );
      if (craneErr) {
        if (
          confirm(
            `${craneErr.error ?? "Crane truck required"}\n\nProceed?`
          )
        ) {
          return assignRoute(plan, ignoreWeight, true, options);
        }
        return false;
      }
    }
    if (res.status === 409 && !ignoreWeight) {
      if (
        confirm(
          `${data.results?.[0]?.error ?? "Capacity limit"}\n\nProceed?`
        )
      ) {
        return assignRoute(plan, true, ignoreCrane, options);
      }
      return false;
    }
    if (!res.ok) {
      setError(
        data.results?.find((r: { error?: string }) => r.error)?.error ??
          data.error ??
          "Assign failed"
      );
      return false;
    }
    if (!options?.silent) {
      setWarning(`Assigned ${plan.city} · ${plan.orders.length} stop(s)`);
      setTimeout(() => setWarning(""), 3000);
      loadPlans();
      void fetch("/api/vehicles")
        .then((r) => readJsonList<Vehicle>(r))
        .then(setVehicles);
    }
    return true;
  }

  async function assignAllRoutes() {
    if (plans.length === 0) return;
    const missing = plans.filter((p) => !planChoice(p.id).vehicleId);
    if (missing.length > 0) {
      setError("Select a truck for each route before assigning all.");
      return;
    }
    setAssigningAll(true);
    setError("");
    for (const plan of plans) {
      const fit = routeFitsVehicle(
        plan,
        vehicles.find((v) => String(v.id) === planChoice(plan.id).vehicleId)
      );
      if (!fit.fits) {
        setError(`${plan.city}: ${fit.message ?? "Does not fit selected truck"}`);
        setAssigningAll(false);
        return;
      }
    }
    let applied = 0;
    for (const plan of plans) {
      const ok = await assignRoute(plan, false, false, { silent: true });
      if (!ok) {
        setAssigningAll(false);
        return;
      }
      applied += 1;
    }
    setAssigningAll(false);
    setWarning(`Assigned ${applied} route(s).`);
    setTimeout(() => setWarning(""), 3000);
    loadPlans();
    void fetch("/api/vehicles")
      .then((r) => readJsonList<Vehicle>(r))
      .then(setVehicles);
  }

  return (
    <AppShell title="Route planning">
      <PageSection title="Filters">
        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Select
              label="Municipality"
              value={filters.region}
              onChange={(e) =>
                setFilters({ ...filters, region: e.target.value, city: "" })
              }
            >
              <option value="">All municipalities</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
            <Select
              label="City / area"
              value={filters.city}
              onChange={(e) =>
                setFilters({ ...filters, city: e.target.value })
              }
            >
              <option value="">All cities</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Select
              label="Employee"
              value={filters.employeeId}
              onChange={(e) =>
                setFilters({ ...filters, employeeId: e.target.value })
              }
            >
              <option value="">All employees</option>
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
              <option value="">All pickers</option>
              {employees
                .filter((e) => e.roles.includes("picker"))
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </Select>
            <Select
              label="Driver"
              value={filters.driverId}
              onChange={(e) =>
                setFilters({ ...filters, driverId: e.target.value })
              }
            >
              <option value="">All drivers</option>
              {employees
                .filter((e) => e.roles.includes("driver"))
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </Select>
            <Select
              label="Vehicle (default for new routes)"
              value={filters.vehicleId}
              onChange={(e) =>
                setFilters({ ...filters, vehicleId: e.target.value })
              }
            >
              <option value="">No default truck</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} — {v.maxPallets} plt max
                </option>
              ))}
            </Select>
            <Select
              label="Delivery round"
              value={filters.deliveryRound}
              onChange={(e) =>
                setFilters({ ...filters, deliveryRound: e.target.value })
              }
            >
              {deliveryRoundSelectOptions().map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              label="Orders per route"
              value={filters.maxOrders}
              onChange={(e) =>
                setFilters({ ...filters, maxOrders: e.target.value })
              }
            >
              <option value="2">2 orders</option>
              <option value="3">3 orders</option>
            </Select>
            <Input
              label="Max distance between stops (km)"
              type="number"
              value={filters.maxDistanceKm}
              onChange={(e) =>
                setFilters({ ...filters, maxDistanceKm: e.target.value })
              }
            />
          </div>
          {selectedVehicle && roundLoad && (
            <p className="mt-3 text-xs text-zinc-500">
              Load for this trip: {roundLoad.totals.pallets}/
              {selectedVehicle.maxPallets} pallets ·{" "}
              {roundLoad.totals.weightKg.toFixed(0)}/
              {selectedVehicle.maxWeightKg} kg
            </p>
          )}
        </Card>
      </PageSection>

      {warning && (
        <div className="mb-4">
          <Alert tone="warning">{warning}</Alert>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="mb-4">
        <Link
          href="/dispatch"
          className="text-sm text-blue-600 underline hover:text-blue-800"
        >
          View on dispatch map
        </Link>
      </div>

      <SmartDispatchPanel
        regionFilter={filters.region || undefined}
        onApplied={() => {
          loadPlans();
          void fetch("/api/vehicles")
            .then((r) => readJsonList<Vehicle>(r))
            .then(setVehicles);
        }}
        onError={setError}
        onWarning={setWarning}
      />

      <PageSection title="Suggested routes">
        {plans.length > 0 && (
          <div className="mb-3 flex justify-end">
            <Button
              variant="secondary"
              disabled={assigningAll || assigningPlanId != null}
              onClick={() => void assignAllRoutes()}
            >
              {assigningAll ? "Assigning…" : "Assign all routes"}
            </Button>
          </div>
        )}
        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : plans.length === 0 ? (
          <Card className="p-4">
            <p className="text-sm text-zinc-500">No routes match the current filters.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {plans.map((plan) => {
              const choice = planChoice(plan.id);
              const selectedVehicle = vehicles.find(
                (v) => String(v.id) === choice.vehicleId
              );
              const fit = routeFitsVehicle(plan, selectedVehicle);
              const busy = assigningPlanId === plan.id || assigningAll;
              return (
              <Card key={plan.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-zinc-900">
                      {plan.city} · {plan.orders.length} stops ·{" "}
                      {plan.totalPallets} pallets · {plan.maxDistanceKm} km
                      between stops · {plan.maxDistanceFromWarehouseKm} km from
                      warehouse
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-zinc-600">
                      {plan.orders.map((o) => (
                        <li key={o.id}>
                          {o.invoiceNumber} — {o.customerName} ·{" "}
                          {o.region ?? plan.region} ({o.totalPallets} plt)
                        </li>
                      ))}
                    </ul>
                    {!fit.fits && (
                      <p className="mt-2 text-xs text-red-600">
                        {fit.message ?? plan.vehicleMessage ?? "Exceeds truck capacity"}
                      </p>
                    )}
                    {fit.fits && plan.vehicleMessage && (
                      <p className="mt-2 text-xs text-amber-700">
                        {plan.vehicleMessage}
                      </p>
                    )}
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:w-56">
                    <Select
                      label="Truck"
                      value={choice.vehicleId}
                      onChange={(e) =>
                        setPlanChoice(plan.id, { vehicleId: e.target.value })
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
                        setPlanChoice(plan.id, { pickerId: e.target.value })
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
                      disabled={!choice.vehicleId || !fit.fits || busy}
                      onClick={() => void assignRoute(plan)}
                    >
                      {assigningPlanId === plan.id ? "Assigning…" : "Assign route"}
                    </Button>
                  </div>
                </div>
              </Card>
            );
            })}
          </div>
        )}
      </PageSection>
    </AppShell>
  );
}
