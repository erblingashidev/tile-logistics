"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge, Button, Card, EmptyState, Input, LoadingState, Select } from "@/components/ui";
import {
  EMPLOYEE_CATEGORIES,
  EMPLOYEE_ROLES,
  EMPLOYEE_ROLE_LABELS,
  EMPLOYEE_STATUSES,
  type EmployeeRole,
} from "@/lib/constants";
import { primaryCategory, categoryLabel } from "@/lib/employee-categories";

interface EmployeeAssignment {
  orderId: number;
  role: string;
  invoiceNumber: string;
  customerName: string;
  orderStatus: string;
  region?: string | null;
  vehicleName?: string;
  plateNumber?: string;
  deliveryRound?: number;
}

interface Employee {
  id: number;
  name: string;
  title?: string | null;
  status: string;
  roles: EmployeeRole[];
  username?: string | null;
  hasLogin?: boolean;
  hasDashboardAdmin?: boolean;
  notes?: string | null;
  warehouseZones?: string[];
  assignedVehicle?: {
    id: number;
    name: string;
    plateNumber: string;
  } | null;
  assignments: EmployeeAssignment[];
}

interface WarehouseZoneOption {
  zone: string;
  leader: { id: number; name: string } | null;
  locationCount: number;
}

interface VehicleOption {
  id: number;
  name: string;
  plateNumber: string;
}

const statusTone: Record<string, "green" | "amber" | "blue" | "red" | "slate"> =
  {
    available: "green",
    busy: "blue",
    on_break: "amber",
    off_duty: "slate",
  };

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [warehouseZones, setWarehouseZones] = useState<WarehouseZoneOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingHasLogin, setEditingHasLogin] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({
    name: "",
    status: "available",
    roles: [] as EmployeeRole[],
    assignedVehicleId: "" as string,
    warehouseZones: [] as string[],
    username: "",
    password: "",
    removePortalLogin: false,
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [employeesRes, vehiclesRes, zonesRes] = await Promise.all([
        fetch("/api/employees"),
        fetch("/api/vehicles"),
        fetch("/api/warehouse/zones"),
      ]);
      setEmployees(await employeesRes.json());
      setVehicles(await vehiclesRes.json());
      setWarehouseZones(await zonesRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggleRole(role: EmployeeRole) {
    setForm((f) => {
      const roles = f.roles.includes(role)
        ? f.roles.filter((r) => r !== role)
        : [...f.roles, role];
      return {
        ...f,
        roles,
        warehouseZones: roles.includes("group_leader") ? f.warehouseZones : [],
      };
    });
  }

  function toggleWarehouseZone(zone: string) {
    setForm((f) => ({
      ...f,
      warehouseZones: f.warehouseZones.includes(zone)
        ? f.warehouseZones.filter((z) => z !== zone)
        : [...f.warehouseZones, zone],
    }));
  }

  function resetForm() {
    setForm({
      name: "",
      status: "available",
      roles: [],
      assignedVehicleId: "",
      warehouseZones: [],
      username: "",
      password: "",
      removePortalLogin: false,
      notes: "",
    });
    setEditingHasLogin(false);
    setFormError("");
  }

  async function saveEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (form.roles.length === 0) return;
    setFormError("");

    const url = editingId ? `/api/employees/${editingId}` : "/api/employees";
    const method = editingId ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        status: form.status,
        roles: form.roles,
        notes: form.notes,
        assignedVehicleId:
          form.roles.includes("driver") && form.assignedVehicleId
            ? Number(form.assignedVehicleId)
            : null,
        warehouseZones: form.roles.includes("group_leader")
          ? form.warehouseZones
          : [],
        ...(form.removePortalLogin
          ? { removePortalLogin: true }
          : {
              username: form.username.trim() || null,
              ...(form.password.trim()
                ? { password: form.password.trim() }
                : {}),
            }),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFormError(data.error ?? "Could not save employee");
      return;
    }

    setShowForm(false);
    setEditingId(null);
    resetForm();
    load();
  }

  function startEdit(e: Employee, credentialsOnly = false) {
    setEditingId(e.id);
    setEditingHasLogin(Boolean(e.hasLogin));
    setForm({
      name: e.name,
      status: e.status,
      roles: e.roles,
      assignedVehicleId: e.assignedVehicle ? String(e.assignedVehicle.id) : "",
      warehouseZones: e.warehouseZones ?? [],
      username: e.username ?? "",
      password: "",
      removePortalLogin: false,
      notes: e.notes ?? "",
    });
    setFormError("");
    setShowForm(true);
    if (credentialsOnly) {
      requestAnimationFrame(() => {
        document
          .getElementById("employee-portal-credentials")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  async function deleteEmployee(id: number) {
    if (!confirm("Delete this employee?")) return;
    await fetch(`/api/employees/${id}`, { method: "DELETE" });
    load();
  }

  async function quickStatus(id: number, status: string) {
    await fetch(`/api/employees/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  return (
    <AppShell title="Employees" description="Roles, contact details, and portal access.">
      <div className="mb-4">
        <Button onClick={() => setShowForm(true)}>Add employee</Button>
      </div>

      {showForm && (
        <Card className="mb-6 p-4">
          <h3 className="mb-4 text-sm font-semibold text-zinc-900">
            {editingId ? "Edit Employee" : "New Employee"}
          </h3>
          <form onSubmit={saveEmployee} className="space-y-4" autoComplete="off">
            {formError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label="Name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <Select
                label="Status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {EMPLOYEE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
              <Input
                label="Notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="space-y-4">
              {EMPLOYEE_CATEGORIES.map((cat) => (
                <div key={cat.id}>
                  <p className="text-sm font-semibold text-zinc-800">{cat.label}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {EMPLOYEE_ROLES.filter((r) => r.category === cat.id).map(
                      (r) => (
                        <label
                          key={r.id}
                          className="flex cursor-pointer items-center gap-2 rounded border border-zinc-200 px-3 py-1.5 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={form.roles.includes(r.id)}
                            onChange={() => toggleRole(r.id)}
                          />
                          {r.label}
                        </label>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div
              id="employee-portal-credentials"
              className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-4"
            >
              <p className="text-sm font-semibold text-zinc-900">Portal login</p>
              <p className="mt-1 text-xs text-zinc-500">
                Employees sign in at /login with this username and password. They
                can change their own password from the portal after signing in.
              </p>
              {editingId && editingHasLogin && (
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-red-700">
                  <input
                    type="checkbox"
                    checked={form.removePortalLogin}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        removePortalLogin: e.target.checked,
                        password: e.target.checked ? "" : form.password,
                      })
                    }
                  />
                  Remove portal login (employee cannot sign in)
                </label>
              )}
              {!form.removePortalLogin && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Portal username"
                    value={form.username}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        username: e.target.value.toLowerCase(),
                        removePortalLogin: false,
                      })
                    }
                    placeholder="e.g. besnik"
                    autoComplete="off"
                    name="employee-portal-username"
                  />
                  <Input
                    label={
                      editingId
                        ? editingHasLogin
                          ? "New password (optional reset)"
                          : "Portal password (required for new login)"
                        : "Portal password"
                    }
                    type="password"
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                    placeholder={
                      editingId && editingHasLogin
                        ? "Leave blank to keep current password"
                        : ""
                    }
                    autoComplete="new-password"
                    name="employee-portal-password"
                  />
                </div>
              )}
            </div>
            {form.roles.includes("driver") && (
              <Select
                label="Assigned truck"
                value={form.assignedVehicleId}
                onChange={(e) =>
                  setForm({ ...form, assignedVehicleId: e.target.value })
                }
              >
                <option value="">No truck assigned</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.plateNumber})
                  </option>
                ))}
              </Select>
            )}
            {form.roles.includes("group_leader") && (
              <div>
                <p className="mb-2 text-xs font-medium text-zinc-600">
                  Warehouse zones (sections)
                </p>
                <p className="mb-3 text-xs text-zinc-500">
                  Each zone can have one group leader. Assigning a zone here moves
                  it from another leader if needed.
                </p>
                <div className="flex flex-wrap gap-2">
                  {warehouseZones.map((option) => {
                    const takenByOther =
                      option.leader &&
                      option.leader.id !== editingId &&
                      !form.warehouseZones.includes(option.zone);
                    return (
                      <label
                        key={option.zone}
                        className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-1.5 text-sm ${
                          form.warehouseZones.includes(option.zone)
                            ? "border-zinc-900 bg-zinc-50"
                            : "border-zinc-200"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={form.warehouseZones.includes(option.zone)}
                          onChange={() => toggleWarehouseZone(option.zone)}
                        />
                        <span>
                          {option.zone}
                          {option.locationCount > 0
                            ? ` · ${option.locationCount} bins`
                            : ""}
                        </span>
                        {takenByOther && (
                          <span className="text-xs text-amber-700">
                            ({option.leader!.name})
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={form.roles.length === 0}>
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  resetForm();
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <LoadingState title="Loading employees…" />
      ) : employees.length === 0 ? (
        <EmptyState title="No employees yet." />
      ) : (
        <div className="space-y-8">
          {EMPLOYEE_CATEGORIES.map((cat) => {
            const group = employees.filter(
              (e) => primaryCategory(e.roles) === cat.id
            );
            if (group.length === 0) return null;
            return (
              <section key={cat.id}>
                <div className="mb-3">
                  <h2 className="text-sm font-semibold text-zinc-900">{cat.label}</h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.map((e) => (
                    <Card key={e.id} className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-zinc-900">{e.name}</p>
                          {e.title && (
                            <p className="text-sm text-zinc-600">{e.title}</p>
                          )}
                          {e.username && (
                            <p className="text-xs text-zinc-500">@{e.username}</p>
                          )}
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Badge tone={statusTone[e.status] ?? "slate"}>
                              {e.status.replace(/_/g, " ")}
                            </Badge>
                            {e.hasDashboardAdmin ? (
                              <Badge tone="blue">Dashboard admin</Badge>
                            ) : null}
                            {e.hasLogin ? (
                              <Badge tone="green">Portal login</Badge>
                            ) : (
                              <Badge tone="slate">No portal login</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <Button
                            variant="ghost"
                            className="text-xs"
                            onClick={() => startEdit(e)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            className="text-xs"
                            onClick={() => startEdit(e, true)}
                          >
                            Credentials
                          </Button>
                          <Button
                            variant="ghost"
                            className="text-xs text-red-600"
                            onClick={() => deleteEmployee(e.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {e.roles.map((r) => (
                          <span
                            key={r}
                            className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600"
                          >
                            {EMPLOYEE_ROLE_LABELS[r]}
                          </span>
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-zinc-400">
                        {categoryLabel(primaryCategory(e.roles))}
                      </p>
                      {e.roles.includes("driver") && e.assignedVehicle && (
                        <p className="mt-2 text-xs text-zinc-500">
                          Truck: {e.assignedVehicle.name} (
                          {e.assignedVehicle.plateNumber})
                        </p>
                      )}
                      {e.roles.includes("group_leader") &&
                        (e.warehouseZones?.length ?? 0) > 0 && (
                          <p className="mt-2 text-xs text-zinc-500">
                            Zones: {e.warehouseZones!.join(", ")}
                          </p>
                        )}
                      {!e.hasLogin && (
                        <p className="mt-1 text-xs text-amber-600">
                          No portal login set
                        </p>
                      )}
                      {e.assignments.length > 0 && (
                        <div className="mt-3 border-t border-zinc-100 pt-3">
                          <p className="text-xs font-medium text-zinc-500">
                            Assigned to
                          </p>
                          <ul className="mt-1 space-y-1 text-xs text-zinc-600">
                            {e.assignments.map((a) => (
                              <li key={`${a.orderId}-${a.role}`}>
                                <span className="font-medium text-zinc-800">
                                  {a.invoiceNumber}
                                </span>
                                {a.vehicleName && (
                                  <span className="text-zinc-500">
                                    {" "}
                                    · {a.vehicleName}
                                  </span>
                                )}
                                <span className="text-zinc-400">
                                  {" "}
                                  ·{" "}
                                  {EMPLOYEE_ROLE_LABELS[a.role as EmployeeRole] ??
                                    a.role}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-1 border-t border-zinc-100 pt-3">
                        {EMPLOYEE_STATUSES.map((s) => (
                          <button
                            key={s}
                            type="button"
                            className={`rounded px-2 py-0.5 text-xs ${
                              e.status === s
                                ? "bg-zinc-900 text-white"
                                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                            }`}
                            onClick={() => quickStatus(e.id, s)}
                          >
                            {s.replace(/_/g, " ")}
                          </button>
                        ))}
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
