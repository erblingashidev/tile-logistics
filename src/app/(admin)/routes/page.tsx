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

  const selectedVehicle = vehicles.find(
    (v) => String(v.id) === filters.vehicleId
  );
  const roundLoad = selectedVehicle?.loads.find(
    (l) => l.round === Number(filters.deliveryRound)
  );

  async function assignRoute(
    plan: RoutePlan,
    ignoreWeight = false,
    ignoreCrane = false
  ) {
    if (!filters.vehicleId) {
      setError("Select a vehicle first.");
      return;
    }
    setError("");
    const res = await fetch("/api/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleId: Number(filters.vehicleId),
        deliveryRound: Number(filters.deliveryRound),
        orderIds: plan.orders.map((o) => o.id),
        ignoreWeightWarning: ignoreWeight,
        ignoreCraneRule: ignoreCrane,
      }),
    });
    const data = await res.json();
    if (res.status === 409 && !ignoreCrane) {
      const craneErr = data.results?.find(
        (r: { requiresCrane?: boolean; error?: string }) => r.requiresCrane
      );
      if (craneErr) {
        if (
          confirm(
            `${craneErr.error ?? "Crane truck required for jumbo tiles"}\n\nAssign to selected truck anyway?`
          )
        ) {
          await assignRoute(plan, ignoreWeight, true);
        }
        return;
      }
    }
    if (res.status === 409 && !ignoreWeight) {
      if (
        confirm(
          `${data.results?.[0]?.error ?? "Capacity issue"}\n\nAssign anyway?`
        )
      ) {
        await assignRoute(plan, true, ignoreCrane);
      }
      return;
    }
    if (!res.ok) {
      setError(data.results?.find((r: { error?: string }) => r.error)?.error ?? "Assign failed");
      return;
    }
    loadPlans();
    void fetch("/api/vehicles")
      .then((r) => readJsonList<Vehicle>(r))
      .then(setVehicles);
  }

  return (
    <AppShell title="Route planning" description="Suggested trips from mapped deliveries.">
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
              label="Vehicle"
              value={filters.vehicleId}
              onChange={(e) =>
                setFilters({ ...filters, vehicleId: e.target.value })
              }
            >
              <option value="">Select vehicle…</option>
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
        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : plans.length === 0 ? (
          <Card className="p-4">
            <p className="text-sm text-zinc-500">No routes match the current filters.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {plans.map((plan) => (
              <Card key={plan.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
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
                    {!plan.fitsVehicle && (
                      <p className="mt-2 text-xs text-red-600">
                        {plan.vehicleMessage ?? "Exceeds vehicle pallet capacity"}
                      </p>
                    )}
                    {plan.fitsVehicle && plan.vehicleMessage && (
                      <p className="mt-2 text-xs text-amber-700">
                        {plan.vehicleMessage}
                      </p>
                    )}
                  </div>
                  <Button
                    disabled={!filters.vehicleId || !plan.fitsVehicle}
                    onClick={() => assignRoute(plan)}
                  >
                    Assign route
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </PageSection>
    </AppShell>
  );
}
