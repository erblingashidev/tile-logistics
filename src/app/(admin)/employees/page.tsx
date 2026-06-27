"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge, Button, Card, EmptyState, Input, Select } from "@/components/ui";
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
  status: string;
  roles: EmployeeRole[];
  username?: string | null;
  hasLogin?: boolean;
  notes?: string | null;
  assignedVehicle?: {
    id: number;
    name: string;
    plateNumber: string;
  } | null;
  assignments: EmployeeAssignment[];
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
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    status: "available",
    roles: [] as EmployeeRole[],
    assignedVehicleId: "" as string,
    username: "",
    password: "",
    notes: "",
  });

  const load = useCallback(async () => {
    const [employeesRes, vehiclesRes] = await Promise.all([
      fetch("/api/employees"),
      fetch("/api/vehicles"),
    ]);
    setEmployees(await employeesRes.json());
    setVehicles(await vehiclesRes.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggleRole(role: EmployeeRole) {
    setForm((f) => ({
      ...f,
      roles: f.roles.includes(role)
        ? f.roles.filter((r) => r !== role)
        : [...f.roles, role],
    }));
  }

  async function saveEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (form.roles.length === 0) return;
    const url = editingId ? `/api/employees/${editingId}` : "/api/employees";
    const method = editingId ? "PUT" : "POST";
    await fetch(url, {
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
        username: form.username.trim() || null,
        ...(form.password.trim()
          ? { password: form.password.trim() }
          : {}),
      }),
    });
    setShowForm(false);
    setEditingId(null);
    setForm({
      name: "",
      status: "available",
      roles: [],
      assignedVehicleId: "",
      username: "",
      password: "",
      notes: "",
    });
    load();
  }

  function startEdit(e: Employee) {
    setEditingId(e.id);
    setForm({
      name: e.name,
      status: e.status,
      roles: e.roles,
      assignedVehicleId: e.assignedVehicle ? String(e.assignedVehicle.id) : "",
      username: e.username ?? "",
      password: "",
      notes: e.notes ?? "",
    });
    setShowForm(true);
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
    <AppShell title="Employees">
      <div className="mb-4">
        <Button onClick={() => setShowForm(true)}>Add employee</Button>
      </div>

      {showForm && (
        <Card className="mb-6 p-4">
          <h3 className="mb-4 text-sm font-semibold text-zinc-900">
            {editingId ? "Edit Employee" : "New Employee"}
          </h3>
          <form onSubmit={saveEmployee} className="space-y-4">
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
                  <p className="text-xs text-zinc-500">{cat.description}</p>
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
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Portal username"
                value={form.username}
                onChange={(e) =>
                  setForm({ ...form, username: e.target.value.toLowerCase() })
                }
                placeholder="e.g. besnik"
              />
              <Input
                label={editingId ? "New password (optional)" : "Portal password"}
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={editingId ? "Leave blank to keep current" : ""}
              />
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
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {employees.length === 0 ? (
        <EmptyState title="No employees yet — add your team members." />
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
                  <p className="text-xs text-zinc-500">{cat.description}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.map((e) => (
                    <Card key={e.id} className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-zinc-900">{e.name}</p>
                          {e.username && (
                            <p className="text-xs text-zinc-500">@{e.username}</p>
                          )}
                          <Badge tone={statusTone[e.status] ?? "slate"}>
                            {e.status.replace(/_/g, " ")}
                          </Badge>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            className="text-xs"
                            onClick={() => startEdit(e)}
                          >
                            Edit
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
