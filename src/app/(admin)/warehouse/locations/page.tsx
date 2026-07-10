"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Button, Card, EmptyState, Input, Select, StatCard, tableClass } from "@/components/ui";
import { formatM2 } from "@/lib/calculations";

interface LocationRow {
  id: number;
  code: string;
  label: string | null;
  zone: string | null;
  notes: string | null;
  productCount: number;
  totalM2: number;
  totalPallets: number;
  totalLoosePieces: number;
}

interface ZoneLeaderRow {
  zone: string;
  leader: { id: number; name: string } | null;
  locationCount: number;
}

interface EmployeeOption {
  id: number;
  name: string;
  roles: string[];
  warehouseZones?: string[];
}

const emptyForm = { code: "", zone: "", label: "", notes: "" };

export default function WarehouseLocationsPage() {
  const router = useRouter();
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [zoneLeaders, setZoneLeaders] = useState<ZoneLeaderRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [assignEmployeeId, setAssignEmployeeId] = useState("");
  const [assignZones, setAssignZones] = useState<string[]>([]);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [locationsRes, zonesRes] = await Promise.all([
      fetch("/api/warehouse/locations"),
      fetch("/api/warehouse/zones"),
    ]);
    setLocations(await locationsRes.json());
    setZoneLeaders(await zonesRes.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setError("");
  }

  function startEdit(loc: LocationRow, e?: React.MouseEvent) {
    e?.stopPropagation();
    setEditingId(loc.id);
    setForm({
      code: loc.code,
      zone: loc.zone ?? "",
      label: loc.label ?? "",
      notes: loc.notes ?? "",
    });
    setMsg("");
    setError("");
  }

  async function saveLocation(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setError("");
    setBusy(true);

    try {
      const url = editingId
        ? `/api/warehouse/locations/${editingId}`
        : "/api/warehouse/locations";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Save failed");
        return;
      }

      setMsg(editingId ? `Updated ${data.code}` : `Added location ${data.code}`);
      resetForm();
      load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteLocation(loc: LocationRow, e: React.MouseEvent) {
    e.stopPropagation();
    const stockNote =
      loc.productCount > 0
        ? `\n\nThis will also remove ${loc.productCount} stock line(s) at this bin.`
        : "";
    if (
      !window.confirm(
        `Delete location ${loc.code}?${stockNote}\n\nThis cannot be undone.`
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/warehouse/locations/${loc.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error ?? "Delete failed");
        return;
      }
      if (editingId === loc.id) resetForm();
      setMsg(`Deleted ${loc.code}`);
      load();
    } finally {
      setBusy(false);
    }
  }

  async function assignLeader(e: React.FormEvent) {
    e.preventDefault();
    if (!assignEmployeeId) return;

    setBusy(true);
    try {
      const res = await fetch("/api/warehouse/zones/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: Number(assignEmployeeId),
          zones: assignZones,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error ?? "Assignment failed");
        return;
      }
      const zoneCount = assignZones.length;
      closeAssignForm();
      setMsg(`Assigned ${zoneCount} zone(s) to ${data.employee.name}`);
      load();
    } finally {
      setBusy(false);
    }
  }

  function closeAssignForm() {
    setShowAssignForm(false);
    setAssignEmployeeId("");
    setAssignZones([]);
  }

  async function openAssignForm(options?: {
    leader?: { id: number; name: string } | null;
    zone?: string;
  }) {
    let list = employees;
    if (list.length === 0) {
      const res = await fetch("/api/employees");
      list = await res.json();
      setEmployees(list);
    }
    setShowAssignForm(true);
    if (options?.leader) {
      setAssignEmployeeId(String(options.leader.id));
      const employee = list.find((e) => e.id === options.leader!.id);
      setAssignZones(
        employee?.warehouseZones ?? (options.zone ? [options.zone] : [])
      );
    } else {
      setAssignEmployeeId("");
      setAssignZones(options?.zone ? [options.zone] : []);
    }
  }

  function toggleAssignZone(zone: string) {
    setAssignZones((prev) =>
      prev.includes(zone) ? prev.filter((z) => z !== zone) : [...prev, zone]
    );
  }

  function pickEmployeeForAssign(id: string) {
    setAssignEmployeeId(id);
    const employee = employees.find((e) => String(e.id) === id);
    setAssignZones(employee?.warehouseZones ?? []);
  }

  const leaderByZone = new Map(
    zoneLeaders.map((row) => [row.zone, row.leader?.name ?? null])
  );

  return (
    <AppShell title="Warehouse locations">
      <Link href="/warehouse" className="mb-4 inline-block text-sm text-zinc-500">
        ← Warehouse
      </Link>

      <Card className="mb-6 p-4">
        <p className="mb-3 font-medium">
          {editingId ? "Edit location" : "New location"}
        </p>
        <form onSubmit={saveLocation} className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Code e.g. A-01"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              required
            />
            <Input
              placeholder="Zone"
              value={form.zone}
              onChange={(e) => setForm({ ...form, zone: e.target.value })}
            />
            <Input
              placeholder="Label e.g. Near loading ramp"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </div>
          <Input
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              {editingId ? "Save changes" : "Add location"}
            </Button>
            {editingId && (
              <Button type="button" variant="secondary" onClick={resetForm}>
                Cancel
              </Button>
            )}
          </div>
        </form>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        {msg && !error && <p className="mt-2 text-sm text-green-700">{msg}</p>}
      </Card>

      {showAssignForm && (
        <Card className="mb-6 p-4">
          <p className="mb-3 font-medium">Assign group leader to zones</p>
          <form onSubmit={assignLeader} className="space-y-3">
            <Select
              label="Employee"
              value={assignEmployeeId}
              onChange={(e) => pickEmployeeForAssign(e.target.value)}
              required
            >
              <option value="">Select employee…</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </Select>
            <div>
              <p className="mb-2 text-xs font-medium text-zinc-600">Zones</p>
              <div className="flex flex-wrap gap-2">
                {zoneLeaders.map((row) => (
                  <label
                    key={row.zone}
                    className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-1.5 text-sm ${
                      assignZones.includes(row.zone)
                        ? "border-zinc-900 bg-zinc-50"
                        : "border-zinc-200"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={assignZones.includes(row.zone)}
                      onChange={() => toggleAssignZone(row.zone)}
                    />
                    {row.zone}
                    {row.leader &&
                      row.leader.id !== Number(assignEmployeeId) && (
                        <span className="text-xs text-amber-700">
                          ({row.leader.name})
                        </span>
                      )}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy || !assignEmployeeId}>
                Save zone assignment
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={closeAssignForm}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="mb-6 overflow-x-auto p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">Zones & group leaders</p>
          <div className="flex flex-wrap gap-2">
            {!showAssignForm && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openAssignForm()}
              >
                Assign group leader
              </Button>
            )}
            <Link href="/employees" className="text-sm text-zinc-500 underline">
              Employee roles →
            </Link>
          </div>
        </div>
        <table className={tableClass}>
          <thead>
            <tr>
              <th>Zone</th>
              <th>Group leader</th>
              <th>Locations</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {zoneLeaders.map((row) => (
              <tr key={row.zone}>
                <td className="font-medium">{row.zone}</td>
                <td>{row.leader?.name ?? "—"}</td>
                <td>{row.locationCount}</td>
                <td>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() =>
                      openAssignForm({
                        leader: row.leader,
                        zone: row.zone,
                      })
                    }
                  >
                    {row.leader ? "Edit" : "Assign"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {locations.length === 0 ? (
        <EmptyState title="No locations yet. Add one above." />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <StatCard label="Locations" value={locations.length} />
            <StatCard
              label="Products stored"
              value={locations.reduce((sum, loc) => sum + loc.productCount, 0)}
            />
            <StatCard
              label="Total m² on hand"
              value={formatM2(locations.reduce((sum, loc) => sum + loc.totalM2, 0))}
            />
          </div>

          <Card className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Zone</th>
                  <th>Leader</th>
                  <th>Label</th>
                  <th>Products</th>
                  <th>Stock</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((loc) => (
                  <tr
                    key={loc.id}
                    className="cursor-pointer hover:bg-zinc-50"
                    onClick={() => router.push(`/warehouse/locations/${loc.id}`)}
                  >
                    <td className="font-medium text-zinc-900">{loc.code}</td>
                    <td>{loc.zone ?? "—"}</td>
                    <td>
                      {loc.zone ? leaderByZone.get(loc.zone) ?? "—" : "—"}
                    </td>
                    <td>{loc.label ?? "—"}</td>
                    <td>{loc.productCount}</td>
                    <td>
                      {loc.productCount === 0 ? (
                        <span className="text-zinc-400">Empty</span>
                      ) : (
                        <>
                          {formatM2(loc.totalM2)} m² · {loc.totalPallets} paleta ·{" "}
                          {loc.totalLoosePieces} pllaka
                        </>
                      )}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          onClick={(e) => startEdit(loc, e)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={busy}
                          onClick={(e) => deleteLocation(loc, e)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </AppShell>
  );
}
