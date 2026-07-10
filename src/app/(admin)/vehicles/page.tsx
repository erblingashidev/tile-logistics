"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Badge, Button, Card, EmptyState, Input, LoadingState, Select } from "@/components/ui";
import { VEHICLE_STATUSES } from "@/lib/constants";
import { DELIVERY_ROUND_SHORT_LABELS } from "@/lib/delivery-rounds";
import { readJsonListWithError } from "@/lib/api/read-json-list";

interface Vehicle {
  id: number;
  name: string;
  plateNumber: string;
  maxWeightKg: number;
  maxPallets: number;
  status: string;
  notes?: string | null;
  assignedDriver?: { id: number; name: string } | null;
  loads: Array<{
    round: number;
    totals: { pallets: number; weightKg: number; m2: number; orders: number };
  }>;
}

const statusTone: Record<string, "green" | "amber" | "blue" | "red" | "slate"> =
  {
    available: "green",
    on_road: "blue",
    returning: "amber",
    maintenance: "red",
    offline: "slate",
  };

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    plateNumber: "",
    maxWeightKg: "3000",
    maxPallets: "8",
    status: "available",
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const vehiclesRes = await fetch("/api/vehicles");
      const payload = await readJsonListWithError<Vehicle>(vehiclesRes);
      setVehicles(payload.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveVehicle(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      maxWeightKg: Number(form.maxWeightKg),
      maxPallets: Number(form.maxPallets),
    };
    const url = editingId ? `/api/vehicles/${editingId}` : "/api/vehicles";
    const method = editingId ? "PUT" : "POST";
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setShowForm(false);
    setEditingId(null);
    setForm({
      name: "",
      plateNumber: "",
      maxWeightKg: "3000",
      maxPallets: "8",
      status: "available",
      notes: "",
    });
    load();
  }

  function startEdit(v: Vehicle) {
    setEditingId(v.id);
    setForm({
      name: v.name,
      plateNumber: v.plateNumber,
      maxWeightKg: String(v.maxWeightKg),
      maxPallets: String(v.maxPallets),
      status: v.status,
      notes: v.notes ?? "",
    });
    setShowForm(true);
  }

  async function deleteVehicle(id: number) {
    if (!confirm("Delete this vehicle?")) return;
    await fetch(`/api/vehicles/${id}`, { method: "DELETE" });
    load();
  }

  async function quickStatus(id: number, status: string) {
    await fetch(`/api/vehicles/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  return (
    <AppShell title="Vehicles">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button className="w-full sm:w-auto" onClick={() => setShowForm(true)}>
          Add vehicle
        </Button>
        <Link href="/vehicles/maintenance" className="w-full sm:w-auto">
          <Button variant="secondary" className="w-full">
            Maintenance log
          </Button>
        </Link>
      </div>

      {showForm && (
        <Card className="mb-6 p-4">
          <h3 className="mb-4 text-sm font-semibold text-zinc-900">
            {editingId ? "Edit Vehicle" : "New Vehicle"}
          </h3>
          <form onSubmit={saveVehicle} className="grid gap-3 sm:grid-cols-3">
            <Input
              label="Name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              label="Plate number"
              required
              value={form.plateNumber}
              onChange={(e) =>
                setForm({ ...form, plateNumber: e.target.value })
              }
            />
            <Input
              label="Max weight (kg)"
              type="number"
              required
              value={form.maxWeightKg}
              onChange={(e) =>
                setForm({ ...form, maxWeightKg: e.target.value })
              }
            />
            <Input
              label="Max pallets"
              type="number"
              required
              value={form.maxPallets}
              onChange={(e) =>
                setForm({ ...form, maxPallets: e.target.value })
              }
            />
            <Select
              label="Status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              {VEHICLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </Select>
            <Input
              label="Notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
            <div className="flex gap-2 sm:col-span-3">
              <Button type="submit">Save</Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading && vehicles.length === 0 ? (
        <LoadingState title="Loading vehicles…" />
      ) : (
      <div className="grid gap-4 md:grid-cols-2">
        {vehicles.map((v) => (
          <Card key={v.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-zinc-900">{v.name}</h3>
                <p className="text-sm text-zinc-500">{v.plateNumber}</p>
              </div>
              <Badge tone={statusTone[v.status] ?? "slate"}>
                {v.status.replace("_", " ")}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-zinc-600">
              {v.maxPallets} pallets · {v.maxWeightKg} kg max
              {v.assignedDriver && ` · Driver: ${v.assignedDriver.name}`}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-5">
              {v.loads.map((load) => (
                <div
                  key={load.round}
                  className="rounded border border-zinc-100 bg-zinc-50 px-2 py-1.5"
                >
                  <p className="font-medium text-zinc-700">R{load.round}</p>
                  <p className="text-[10px] text-zinc-400">
                    {DELIVERY_ROUND_SHORT_LABELS[load.round as 1 | 2 | 3 | 4 | 5]}
                  </p>
                  <p className="text-zinc-500">
                    {load.totals.pallets}/{v.maxPallets} plt
                  </p>
                  <p className="text-zinc-500">{load.totals.orders} ord</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1 border-t border-zinc-100 pt-3">
              <Select
                className="mb-2 w-full sm:hidden"
                value={v.status}
                onChange={(e) => quickStatus(v.id, e.target.value)}
              >
                {VEHICLE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </Select>
              <div className="hidden flex-wrap gap-1 sm:flex">
                {VEHICLE_STATUSES.map((s) => (
                  <Button
                    key={s}
                    variant="secondary"
                    size="sm"
                    onClick={() => quickStatus(v.id, s)}
                  >
                    {s.replace("_", " ")}
                  </Button>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={() => startEdit(v)}>
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600"
                onClick={() => deleteVehicle(v.id)}
              >
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>
      )}
      {!loading && vehicles.length === 0 && (
        <Card className="p-4">
          <EmptyState title="No vehicles." />
        </Card>
      )}
    </AppShell>
  );
}
