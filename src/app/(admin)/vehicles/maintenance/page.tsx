"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageSection,
  ResponsiveTable,
  Select,
  StatCard,
  Textarea,
  tableClass,
} from "@/components/ui";
import type { MaintenanceDueStatus } from "@/lib/services/vehicle-maintenance";

interface MaintenanceRecord {
  id: number;
  vehicleId: number;
  vehicleName: string;
  plateNumber: string;
  performedAt: string;
  nextDueAt: string | null;
  workDone: string;
  cost: number;
  notes: string | null;
  dueStatus: MaintenanceDueStatus;
}

interface VehicleOverview {
  vehicleId: number;
  name: string;
  plateNumber: string;
  status: string;
  recordCount: number;
  totalCost: number;
  lastPerformedAt: string | null;
  nextDueAt: string | null;
  dueStatus: MaintenanceDueStatus;
  records: MaintenanceRecord[];
}

interface DashboardData {
  overview: VehicleOverview[];
  stats: {
    overdue: number;
    dueSoon: number;
    totalCost: number;
    monthCost: number;
    vehicleCount: number;
  };
}

const emptyForm = {
  vehicleId: "",
  performedAt: new Date().toISOString().slice(0, 10),
  nextDueAt: "",
  workDone: "",
  cost: "",
  notes: "",
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "short", year: "numeric" }
  );
}

function dueTone(
  status: MaintenanceDueStatus
): "green" | "amber" | "red" | "slate" {
  if (status === "overdue") return "red";
  if (status === "due_soon") return "amber";
  if (status === "ok") return "green";
  return "slate";
}

function dueLabel(status: MaintenanceDueStatus) {
  if (status === "overdue") return "Overdue";
  if (status === "due_soon") return "Due soon";
  if (status === "ok") return "Scheduled";
  return "No schedule";
}

export default function VehicleMaintenancePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [filterVehicleId, setFilterVehicleId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedVehicleId, setExpandedVehicleId] = useState<number | null>(
    null
  );
  const [form, setForm] = useState(emptyForm);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/vehicles/maintenance?view=overview");
    setData(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredOverview = useMemo(() => {
    if (!data) return [];
    if (!filterVehicleId) return data.overview;
    return data.overview.filter(
      (v) => String(v.vehicleId) === filterVehicleId
    );
  }, [data, filterVehicleId]);

  const allRecords = useMemo(() => {
    return filteredOverview.flatMap((v) => v.records);
  }, [filteredOverview]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    setError("");
  }

  function startAdd(vehicleId?: number) {
    setEditingId(null);
    setForm({
      ...emptyForm,
      vehicleId: vehicleId ? String(vehicleId) : "",
      performedAt: new Date().toISOString().slice(0, 10),
    });
    setShowForm(true);
  }

  function startEdit(record: MaintenanceRecord) {
    setEditingId(record.id);
    setForm({
      vehicleId: String(record.vehicleId),
      performedAt: record.performedAt.slice(0, 10),
      nextDueAt: record.nextDueAt?.slice(0, 10) ?? "",
      workDone: record.workDone,
      cost: String(record.cost),
      notes: record.notes ?? "",
    });
    setShowForm(true);
  }

  async function saveRecord(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");

    const payload = {
      vehicleId: Number(form.vehicleId),
      performedAt: form.performedAt,
      nextDueAt: form.nextDueAt || null,
      workDone: form.workDone,
      cost: Number(form.cost || 0),
      notes: form.notes,
    };

    const url = editingId
      ? `/api/vehicles/maintenance/${editingId}`
      : "/api/vehicles/maintenance";
    const method = editingId ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Save failed");
      return;
    }

    setMsg(editingId ? "Maintenance record updated" : "Maintenance record saved");
    resetForm();
    load();
  }

  async function deleteRecord(id: number) {
    if (!window.confirm("Delete this maintenance record?")) return;
    const res = await fetch(`/api/vehicles/maintenance/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      window.alert((await res.json()).error ?? "Delete failed");
      return;
    }
    load();
  }

  return (
    <AppShell
      title="Vehicle maintenance"
      description="Service history and due dates."
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Link href="/vehicles" className="text-sm text-zinc-500 underline">
          ← Fleet
        </Link>
        {!showForm && (
          <Button className="w-full sm:w-auto" onClick={() => startAdd()}>
            Log maintenance
          </Button>
        )}
      </div>

      {data && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Vehicles" value={data.stats.vehicleCount} />
          <StatCard label="Overdue" value={data.stats.overdue} />
          <StatCard label="Due soon" value={data.stats.dueSoon} />
          <StatCard
            label="Cost this month"
            value={formatMoney(data.stats.monthCost)}
          />
        </div>
      )}

      {showForm && (
        <Card className="mb-6 p-4 sm:p-5">
          <h3 className="mb-4 text-sm font-semibold text-zinc-900">
            {editingId ? "Edit maintenance record" : "New maintenance record"}
          </h3>
          <form onSubmit={saveRecord} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Vehicle"
                value={form.vehicleId}
                onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}
                required
              >
                <option value="">Select vehicle…</option>
                {data?.overview.map((v) => (
                  <option key={v.vehicleId} value={v.vehicleId}>
                    {v.name} ({v.plateNumber})
                  </option>
                ))}
              </Select>
              <Input
                label="Cost (€)"
                type="number"
                min={0}
                step="0.01"
                value={form.cost}
                onChange={(e) => setForm({ ...form, cost: e.target.value })}
              />
              <Input
                label="Service date"
                type="date"
                value={form.performedAt}
                onChange={(e) =>
                  setForm({ ...form, performedAt: e.target.value })
                }
                required
              />
              <Input
                label="Next service due"
                type="date"
                value={form.nextDueAt}
                onChange={(e) =>
                  setForm({ ...form, nextDueAt: e.target.value })
                }
                hint="When this vehicle should be serviced again"
              />
            </div>
            <Textarea
              label="What was changed / done"
              value={form.workDone}
              onChange={(e) => setForm({ ...form, workDone: e.target.value })}
              rows={3}
              required
              placeholder="e.g. Oil change, brake pads, tires rotated…"
            />
            <Textarea
              label="Notes (optional)"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              placeholder="Supplier, mileage, warranty, extra details…"
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" className="w-full sm:w-auto">
                Save record
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={resetForm}
              >
                Cancel
              </Button>
            </div>
          </form>
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
          {msg && !error && <p className="mt-2 text-sm text-green-700">{msg}</p>}
        </Card>
      )}

      {!data ? (
        <EmptyState title="Loading…" />
      ) : (
        <>
          <PageSection title="Fleet schedule">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <Select
                label="Filter vehicle"
                value={filterVehicleId}
                onChange={(e) => setFilterVehicleId(e.target.value)}
                className="w-full sm:max-w-xs"
              >
                <option value="">All vehicles</option>
                {data.overview.map((v) => (
                  <option key={v.vehicleId} value={v.vehicleId}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredOverview.map((vehicle) => (
                <Card key={vehicle.vehicleId} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-zinc-900">{vehicle.name}</p>
                      <p className="text-sm text-zinc-500">{vehicle.plateNumber}</p>
                    </div>
                    <Badge tone={dueTone(vehicle.dueStatus)}>
                      {dueLabel(vehicle.dueStatus)}
                    </Badge>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-zinc-500">Last service</dt>
                      <dd className="font-medium text-zinc-800">
                        {formatDate(vehicle.lastPerformedAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">Next due</dt>
                      <dd className="font-medium text-zinc-800">
                        {formatDate(vehicle.nextDueAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">Total spent</dt>
                      <dd className="font-medium text-zinc-800">
                        {formatMoney(vehicle.totalCost)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">Records</dt>
                      <dd className="font-medium text-zinc-800">
                        {vehicle.recordCount}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => startAdd(vehicle.vehicleId)}
                    >
                      Add service
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setExpandedVehicleId((prev) =>
                          prev === vehicle.vehicleId ? null : vehicle.vehicleId
                        )
                      }
                    >
                      {expandedVehicleId === vehicle.vehicleId
                        ? "Hide history"
                        : "History"}
                    </Button>
                  </div>
                  {expandedVehicleId === vehicle.vehicleId && (
                    <div className="mt-3 space-y-2 border-t border-zinc-100 pt-3">
                      {vehicle.records.length === 0 ? (
                        <p className="text-xs text-zinc-500">No records yet.</p>
                      ) : (
                        vehicle.records.map((record) => (
                          <div
                            key={record.id}
                            className="rounded border border-zinc-100 bg-zinc-50 p-3 text-xs"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-medium text-zinc-900">
                                {formatDate(record.performedAt)} ·{" "}
                                {formatMoney(record.cost)}
                              </p>
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => startEdit(record)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-600"
                                  onClick={() => deleteRecord(record.id)}
                                >
                                  Delete
                                </Button>
                              </div>
                            </div>
                            <p className="mt-1 text-zinc-700">{record.workDone}</p>
                            {record.nextDueAt && (
                              <p className="mt-1 text-zinc-500">
                                Next due: {formatDate(record.nextDueAt)}
                              </p>
                            )}
                            {record.notes && (
                              <p className="mt-1 text-zinc-500">{record.notes}</p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </PageSection>

          <PageSection title="All maintenance records">
            {allRecords.length === 0 ? (
              <EmptyState title="No maintenance records yet." />
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {allRecords.map((record) => (
                    <Card key={record.id} className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-zinc-900">
                            {record.vehicleName}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {record.plateNumber} · {formatDate(record.performedAt)}
                          </p>
                        </div>
                        <Badge tone={dueTone(record.dueStatus)}>
                          {dueLabel(record.dueStatus)}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-zinc-700">{record.workDone}</p>
                      <p className="mt-2 text-sm font-medium text-zinc-900">
                        {formatMoney(record.cost)}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Next due: {formatDate(record.nextDueAt)}
                      </p>
                      {record.notes && (
                        <p className="mt-2 text-xs text-zinc-500">{record.notes}</p>
                      )}
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => startEdit(record)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => deleteRecord(record.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>

                <div className="hidden md:block">
                  <ResponsiveTable>
                    <table className={tableClass}>
                      <thead>
                        <tr>
                          <th>Vehicle</th>
                          <th>Service date</th>
                          <th>Work done</th>
                          <th>Cost</th>
                          <th>Next due</th>
                          <th>Status</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {allRecords.map((record) => (
                          <tr key={record.id}>
                            <td>
                              <p className="font-medium">{record.vehicleName}</p>
                              <p className="text-xs text-zinc-500">
                                {record.plateNumber}
                              </p>
                            </td>
                            <td>{formatDate(record.performedAt)}</td>
                            <td className="max-w-xs">
                              <p className="line-clamp-2">{record.workDone}</p>
                              {record.notes && (
                                <p className="mt-1 line-clamp-1 text-xs text-zinc-500">
                                  {record.notes}
                                </p>
                              )}
                            </td>
                            <td>{formatMoney(record.cost)}</td>
                            <td>{formatDate(record.nextDueAt)}</td>
                            <td>
                              <Badge tone={dueTone(record.dueStatus)}>
                                {dueLabel(record.dueStatus)}
                              </Badge>
                            </td>
                            <td>
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => startEdit(record)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-600"
                                  onClick={() => deleteRecord(record.id)}
                                >
                                  Delete
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ResponsiveTable>
                </div>
              </>
            )}
          </PageSection>
        </>
      )}
    </AppShell>
  );
}
