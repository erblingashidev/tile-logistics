"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ChangePasswordCard } from "@/components/portal/ChangePasswordCard";
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  LoadingState,
} from "@/components/ui";

interface AdminProfile {
  id: number;
  name: string;
  username: string;
  title: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [form, setForm] = useState({
    name: "",
    username: "",
    title: "",
    email: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [invoiceFolder, setInvoiceFolder] = useState("");
  const [invoiceFolderConfigured, setInvoiceFolderConfigured] = useState(false);
  const [invoiceFolderSaving, setInvoiceFolderSaving] = useState(false);
  const [invoiceFolderSuccess, setInvoiceFolderSuccess] = useState("");
  const [invoiceFolderError, setInvoiceFolderError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admins/me", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProfile(null);
        setError(data.error ?? "Could not load your profile");
        return;
      }
      setProfile(data);
      setForm({
        name: data.name ?? "",
        username: data.username ?? "",
        title: data.title ?? "",
        email: data.email ?? "",
      });
    } catch {
      setProfile(null);
      setError("Could not load your profile");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadInvoiceFolder = useCallback(async () => {
    const res = await fetch("/api/settings/invoice-import", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) return;
    const data = await res.json();
    setInvoiceFolder(data.watchRoot ?? "");
    setInvoiceFolderConfigured(Boolean(data.configured));
  }, []);

  useEffect(() => {
    load();
    void loadInvoiceFolder();
  }, [load, loadInvoiceFolder]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    const res = await fetch("/api/admins/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "Could not save profile");
      return;
    }

    setProfile(data);
    setForm({
      name: data.name ?? "",
      username: data.username ?? "",
      title: data.title ?? "",
      email: data.email ?? "",
    });
    setSuccess("Profile updated");
    router.refresh();
    setTimeout(() => setSuccess(""), 3000);
  }

  async function saveInvoiceFolder(e: React.FormEvent) {
    e.preventDefault();
    setInvoiceFolderError("");
    setInvoiceFolderSuccess("");
    setInvoiceFolderSaving(true);

    const res = await fetch("/api/settings/invoice-import", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watchRoot: invoiceFolder }),
    });
    const data = await res.json().catch(() => ({}));
    setInvoiceFolderSaving(false);

    if (!res.ok) {
      setInvoiceFolderError(data.error ?? "Could not save folder path");
      return;
    }

    setInvoiceFolder(data.watchRoot ?? invoiceFolder);
    setInvoiceFolderConfigured(Boolean(data.configured));
    setInvoiceFolderSuccess("Invoice folder saved for this database");
    setTimeout(() => setInvoiceFolderSuccess(""), 4000);
  }

  return (
    <AppShell
      title="Profile"
      description="Account and password."
    >
      {loading ? (
        <LoadingState title="Loading profile…" />
      ) : !profile ? (
        <Card className="p-5">
          <Alert tone="error">
            {error ||
              "Could not load your profile. Log out and log in again, then retry."}
          </Alert>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  Account details
                </h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Update your name and login username.
                </p>
              </div>
              <Badge tone={profile.isActive ? "green" : "red"}>
                {profile.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>

            <form onSubmit={saveProfile} className="mt-5 space-y-3">
              {error && <Alert tone="error">{error}</Alert>}
              {success && <Alert tone="info">{success}</Alert>}

              <Input
                label="Full name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
              <Input
                label="Title / role"
                hint="e.g. Warehouse Lead, General Manager"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
              <Input
                label="Username"
                value={form.username}
                onChange={(e) =>
                  setForm((f) => ({ ...f, username: e.target.value }))
                }
                autoComplete="username"
                required
              />
              <Input
                label="Email (optional)"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />

              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save profile"}
                </Button>
              </div>
            </form>

            <dl className="mt-6 space-y-3 border-t border-zinc-100 pt-5 text-sm">
              <div>
                <dt className="text-zinc-500">Last login</dt>
                <dd className="font-medium text-zinc-900">
                  {formatDate(profile.lastLoginAt)}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Account created</dt>
                <dd className="font-medium text-zinc-900">
                  {formatDate(profile.createdAt)}
                </dd>
              </div>
            </dl>

            <p className="mt-5 text-xs text-zinc-500">
              Need to add another manager or CEO?{" "}
              <Link href="/admins" className="font-medium text-zinc-800 underline">
                Manage admin users
              </Link>
            </p>
          </Card>

          <ChangePasswordCard variant="admin" defaultOpen />
        </div>
      )}

      {!loading && profile && (
        <Card className="mt-5 p-5">
          <h2 className="text-lg font-semibold text-zinc-900">
            Invoice import folder
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Main folder on this PC where Pro-Data saves Excel files. Inside it,
            use date subfolders like{" "}
            <span className="font-mono">09.07.2026</span> — each Excel file is
            queued for approval on the Orders page. Change this path when you
            switch computers (Windows or Mac).
          </p>

          <form onSubmit={saveInvoiceFolder} className="mt-5 space-y-3">
            {invoiceFolderError && (
              <Alert tone="error">{invoiceFolderError}</Alert>
            )}
            {invoiceFolderSuccess && (
              <Alert tone="info">{invoiceFolderSuccess}</Alert>
            )}

            <Input
              label="Main folder path"
              value={invoiceFolder}
              onChange={(e) => setInvoiceFolder(e.target.value)}
              placeholder="C:\Faturat-Logistics or /Users/you/Faturat-Logistics"
              spellCheck={false}
              required
            />

            <p className="text-xs text-zinc-500">
              {invoiceFolderConfigured
                ? "Saved. Optional: run npm run watch:invoices on this PC for automatic queueing while you work."
                : "Not configured yet — enter the path to Faturat-Logistics on this PC."}
            </p>

            <Button type="submit" disabled={invoiceFolderSaving}>
              {invoiceFolderSaving ? "Saving…" : "Save folder path"}
            </Button>
          </form>
        </Card>
      )}
    </AppShell>
  );
}
