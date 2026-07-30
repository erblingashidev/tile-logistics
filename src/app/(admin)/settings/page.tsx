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
  const [manualDispatchMode, setManualDispatchMode] = useState(true);
  const [featuresLoading, setFeaturesLoading] = useState(true);
  const [featuresSaving, setFeaturesSaving] = useState(false);
  const [featuresError, setFeaturesError] = useState("");
  const [featuresSuccess, setFeaturesSuccess] = useState("");

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

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setFeaturesLoading(true);
    fetch("/api/settings/features", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { manualDispatchMode?: boolean; error?: string }) => {
        if (typeof data.manualDispatchMode === "boolean") {
          setManualDispatchMode(data.manualDispatchMode);
        }
        if (data.error) setFeaturesError(data.error);
      })
      .catch(() => setFeaturesError("Could not load operations settings"))
      .finally(() => setFeaturesLoading(false));
  }, []);

  async function saveManualDispatchMode(enabled: boolean) {
    setFeaturesError("");
    setFeaturesSuccess("");
    setFeaturesSaving(true);
    const res = await fetch("/api/settings/features", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manualDispatchMode: enabled }),
    });
    const data = await res.json().catch(() => ({}));
    setFeaturesSaving(false);
    if (!res.ok) {
      setFeaturesError(data.error ?? "Could not save operations settings");
      return;
    }
    setManualDispatchMode(Boolean(data.manualDispatchMode));
    setFeaturesSuccess(
      enabled
        ? "Manual dispatch mode enabled — employee workflow paused"
        : "Employee delivery workflow re-enabled"
    );
    setTimeout(() => setFeaturesSuccess(""), 4000);
  }

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

  return (
    <AppShell title="Profile">
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
                label="Title"
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

            <Link href="/admins" className="mt-5 inline-block text-sm font-medium text-zinc-800 underline">
              Manage admin users
            </Link>
          </Card>

          <ChangePasswordCard variant="admin" defaultOpen />

          <Card className="p-5 lg:col-span-2">
            <h2 className="text-lg font-semibold text-zinc-900">Operations</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Control whether employees use the portal to mark orders prepared,
              loaded, and delivered, or whether admins handle status manually.
            </p>

            {featuresLoading ? (
              <LoadingState title="Loading operations settings…" />
            ) : (
              <div className="mt-5 space-y-4">
                {featuresError && <Alert tone="error">{featuresError}</Alert>}
                {featuresSuccess && (
                  <Alert tone="info">{featuresSuccess}</Alert>
                )}

                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50/80 p-4">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-zinc-300"
                    checked={manualDispatchMode}
                    disabled={featuresSaving}
                    onChange={(e) => void saveManualDispatchMode(e.target.checked)}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-zinc-900">
                      Manual dispatch mode
                    </span>
                    <span className="mt-1 block text-sm text-zinc-600">
                      When on, truck assignment still works in admin, but
                      picker assignment and portal proofs (prepared, loaded,
                      departed, delivered) are disabled. Use manual status on
                      the Orders page instead.
                    </span>
                  </span>
                </label>
              </div>
            )}
          </Card>
        </div>
      )}
    </AppShell>
  );
}
