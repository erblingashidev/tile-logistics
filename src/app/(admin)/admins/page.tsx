"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingState,
  Select,
} from "@/components/ui";
import type { EmployeeRole } from "@/lib/constants";
import { ADMIN_EMPLOYEE_ROLE_OPTIONS } from "@/lib/admin-roles";

interface AdminUser {
  id: number;
  name: string;
  username: string;
  title: string | null;
  email: string | null;
  employeeRole: EmployeeRole | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

const emptyForm = {
  name: "",
  username: "",
  password: "",
  title: "",
  email: "",
  employeeRole: "warehouse_admin" as EmployeeRole,
};

function formatDate(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function AdminsPage() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [currentAdminId, setCurrentAdminId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [adminsRes, meRes] = await Promise.all([
        fetch("/api/admins", { cache: "no-store" }),
        fetch("/api/auth/me", { cache: "no-store" }),
      ]);
      if (adminsRes.ok) {
        setAdmins(await adminsRes.json());
      }
      if (meRes.ok) {
        const me = await meRes.json();
        if (me.user?.role === "admin" && me.user.adminId > 0) {
          setCurrentAdminId(me.user.adminId);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createAdmin(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const res = await fetch("/api/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFormError(data.error ?? "Could not create admin");
      return;
    }
    setForm(emptyForm);
    setShowForm(false);
    load();
  }

  async function toggleActive(admin: AdminUser) {
    setBusyId(admin.id);
    const res = await fetch(`/api/admins/${admin.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !admin.isActive }),
    });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Could not update admin");
      return;
    }
    load();
  }

  return (
    <AppShell
      title="Admin users"
      description="Managers and leaders with full dashboard access"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-600">
          Each admin is also added to Employees under Management with the role
          you pick here (CEO, General Manager, Warehouse Lead).
        </p>
        <Button onClick={() => setShowForm((value) => !value)}>
          {showForm ? "Cancel" : "Add admin"}
        </Button>
      </div>

      {showForm && (
        <Card className="mb-5 p-5">
          <h2 className="text-sm font-semibold text-zinc-900">New admin account</h2>
          <form onSubmit={createAdmin} className="mt-4 grid gap-3 sm:grid-cols-2">
            {formError && (
              <div className="sm:col-span-2">
                <Alert tone="error">{formError}</Alert>
              </div>
            )}
            <Input
              label="Full name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            <Select
              label="Role in Employees"
              value={form.employeeRole}
              onChange={(e) => {
                const employeeRole = e.target.value as EmployeeRole;
                const option = ADMIN_EMPLOYEE_ROLE_OPTIONS.find(
                  (item) => item.role === employeeRole
                );
                setForm((f) => ({
                  ...f,
                  employeeRole,
                  title: f.title || option?.defaultTitle || f.title,
                }));
              }}
            >
              {ADMIN_EMPLOYEE_ROLE_OPTIONS.map((option) => (
                <option key={option.role} value={option.role}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Input
              label="Title shown on profile"
              hint="Appears under their name on the Employees page"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
            <Input
              label="Username"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              autoComplete="off"
              required
            />
            <Input
              label="Email (optional)"
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <Input
              label="Password"
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              autoComplete="new-password"
              required
            />
            <div className="flex items-end sm:col-span-2">
              <Button type="submit">Create admin</Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <LoadingState title="Loading admins…" />
      ) : admins.length === 0 ? (
        <EmptyState title="No admin accounts yet. Create the first one above." />
      ) : (
        <div className="space-y-3">
          {admins.map((admin) => (
            <Card key={admin.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-zinc-900">{admin.name}</h3>
                    {currentAdminId === admin.id ? (
                      <Badge tone="blue">You</Badge>
                    ) : null}
                    <Badge tone={admin.isActive ? "green" : "slate"}>
                      {admin.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  {admin.title ? (
                    <p className="mt-1 text-sm text-zinc-600">{admin.title}</p>
                  ) : null}
                  {admin.employeeRole ? (
                    <p className="mt-1 text-xs text-zinc-500">
                      Employees role:{" "}
                      {
                        ADMIN_EMPLOYEE_ROLE_OPTIONS.find(
                          (option) => option.role === admin.employeeRole
                        )?.label
                      }
                    </p>
                  ) : null}
                  <p className="mt-2 text-sm text-zinc-500">
                    @{admin.username}
                    {admin.email ? ` · ${admin.email}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">
                    Last login: {formatDate(admin.lastLoginAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {currentAdminId === admin.id ? (
                    <Link href="/settings">
                      <Button variant="secondary">Profile</Button>
                    </Link>
                  ) : null}
                  <Button
                    variant={admin.isActive ? "secondary" : "primary"}
                    disabled={busyId === admin.id || currentAdminId === admin.id}
                    onClick={() => toggleActive(admin)}
                  >
                    {admin.isActive ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
