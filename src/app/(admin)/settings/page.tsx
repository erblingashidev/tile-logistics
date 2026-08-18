"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ChangePasswordCard } from "@/components/portal/ChangePasswordCard";
import { broadcastFeatureFlags } from "@/components/features/FeatureFlagsProvider";
import {
  FEATURE_FLAG_META,
  FEATURE_RECOMMENDATIONS,
  moduleSwitchChecked,
  moduleSwitchToFlagValue,
  parseFeatureFlags,
  type FeatureFlagGroup,
  type FeatureFlagId,
  type FeatureFlags,
} from "@/lib/features/catalog";
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  LoadingState,
  Switch,
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

const GROUPS: FeatureFlagGroup[] = ["Operations", "Dispatch", "Warehouse"];

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
  const [flags, setFlags] = useState<FeatureFlags>(() => parseFeatureFlags({}));
  const [featuresLoading, setFeaturesLoading] = useState(true);
  const [featuresSaving, setFeaturesSaving] = useState<FeatureFlagId | null>(
    null
  );
  const [featuresError, setFeaturesError] = useState("");
  const [featuresSuccess, setFeaturesSuccess] = useState("");

  const groupedFlags = useMemo(() => {
    return GROUPS.map((group) => ({
      group,
      items: FEATURE_FLAG_META.filter((item) => item.group === group),
    })).filter((section) => section.items.length > 0);
  }, []);

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
      .then((data: FeatureFlags & { error?: string }) => {
        if (data.error) setFeaturesError(data.error);
        else setFlags(parseFeatureFlags(data));
      })
      .catch(() => setFeaturesError("Could not load operations settings"))
      .finally(() => setFeaturesLoading(false));
  }, []);

  async function savePatch(patch: Partial<FeatureFlags>, successText?: string) {
    setFeaturesError("");
    setFeaturesSuccess("");
    const keys = Object.keys(patch) as FeatureFlagId[];
    setFeaturesSaving(keys[0] ?? "operationsSuite");
    const previous = flags;
    const optimistic = { ...flags, ...patch };
    setFlags(optimistic);
    const res = await fetch("/api/settings/features", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    setFeaturesSaving(null);
    if (!res.ok) {
      setFlags(previous);
      setFeaturesError(data.error ?? "Could not save operations settings");
      return;
    }
    const next = parseFeatureFlags(data);
    setFlags(next);
    broadcastFeatureFlags(next);
    setFeaturesSuccess(
      successText ??
        (patch.operationsSuite === true
          ? "Logistics mode on"
          : patch.operationsSuite === false
            ? "Records mode on"
            : "Setting saved")
    );
    router.refresh();
    setTimeout(() => setFeaturesSuccess(""), 4000);
  }

  async function saveFlag(id: FeatureFlagId, enabled: boolean) {
    const value = moduleSwitchToFlagValue(id, enabled);
    const meta = FEATURE_FLAG_META.find((item) => item.id === id);
    await savePatch(
      { [id]: value },
      `${meta?.title ?? "Setting"} ${enabled ? "enabled" : "disabled"}`
    );
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
    <AppShell
      title="Settings"
      description="Account, security, and how this system is used"
    >
      {loading ? (
        <LoadingState title="Loading settings…" />
      ) : !profile ? (
        <Card className="p-5">
          <Alert tone="error">
            {error ||
              "Could not load your profile. Log out and log in again, then retry."}
          </Alert>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Account
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-zinc-900">
                    Profile
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
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  required
                />
                <Input
                  label="Title"
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
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
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }
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

              <Link
                href="/admins"
                className="mt-5 inline-block text-sm font-medium text-zinc-800 underline"
              >
                Manage admin users
              </Link>
            </Card>

            <ChangePasswordCard variant="admin" defaultOpen />
          </div>

          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  System
                </p>
                <h2 className="mt-1 text-lg font-semibold text-zinc-900">
                  How you use Tile Logistics
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-zinc-600">
                  One switch for the whole warehouse and dispatch system. After
                  Logistics is on, you can still turn individual modules off.
                </p>
              </div>
            </div>

            {featuresLoading ? (
              <LoadingState title="Loading modules…" />
            ) : (
              <div className="mt-5 space-y-6">
                {featuresError && <Alert tone="error">{featuresError}</Alert>}
                {featuresSuccess && (
                  <Alert tone="info">{featuresSuccess}</Alert>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={featuresSaving != null}
                    onClick={() => {
                      if (!flags.operationsSuite) return;
                      void savePatch(
                        { operationsSuite: false },
                        "Records mode on"
                      );
                    }}
                    className={`rounded-xl border p-4 text-left transition ${
                      !flags.operationsSuite
                        ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900"
                        : "border-zinc-200 bg-white hover:border-zinc-400"
                    } disabled:opacity-60`}
                  >
                    <p className="text-sm font-semibold text-zinc-900">
                      Records
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-600">
                      Keep invoices, delivery info, reports, and logs. Dispatch,
                      warehouse tools, and the employee portal stay hidden.
                    </p>
                    <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      {!flags.operationsSuite ? "Active" : "Office evidence"}
                    </p>
                  </button>
                  <button
                    type="button"
                    disabled={featuresSaving != null}
                    onClick={() => {
                      if (flags.operationsSuite) return;
                      void savePatch(
                        { operationsSuite: true },
                        "Logistics mode on"
                      );
                    }}
                    className={`rounded-xl border p-4 text-left transition ${
                      flags.operationsSuite
                        ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900"
                        : "border-zinc-200 bg-white hover:border-zinc-400"
                    } disabled:opacity-60`}
                  >
                    <p className="text-sm font-semibold text-zinc-900">
                      Logistics & warehouse
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-600">
                      Dispatch board, truck assignment, employee delivery steps,
                      and WMS. Fine-tune the modules below if you do not need
                      everything.
                    </p>
                    <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      {flags.operationsSuite ? "Active" : "Full operations"}
                    </p>
                  </button>
                </div>

                <div className={!flags.operationsSuite ? "opacity-60" : ""}>
                  <div className="mb-3">
                    <h3 className="text-sm font-semibold text-zinc-900">
                      Modules
                    </h3>
                    <p className="mt-1 text-sm text-zinc-600">
                      {flags.operationsSuite
                        ? "Turn off anything you are not using yet. Dispatch and Map stay available while Logistics is on."
                        : "Paused in Records mode. Switch to Logistics to use these — your choices are saved."}
                    </p>
                  </div>

                  {groupedFlags.map((section) => (
                    <div key={section.group} className="mb-4 last:mb-0">
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                        {section.group}
                      </h4>
                      <div className="space-y-2">
                        {section.items.map((item) => (
                          <Switch
                            key={item.id}
                            label={item.title}
                            description={item.description}
                            status={
                              moduleSwitchChecked(flags, item.id)
                                ? item.enabledLabel
                                : item.disabledLabel
                            }
                            checked={moduleSwitchChecked(flags, item.id)}
                            disabled={
                              !flags.operationsSuite || featuresSaving != null
                            }
                            onCheckedChange={(enabled) =>
                              void saveFlag(item.id, enabled)
                            }
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Roadmap
            </p>
            <h2 className="mt-1 text-lg font-semibold text-zinc-900">
              Recommended next
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              Not built yet — high-value additions when the current workflow is
              stable.
            </p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-3">
              {FEATURE_RECOMMENDATIONS.map((item) => (
                <li
                  key={item.title}
                  className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/70 p-4"
                >
                  <p className="text-sm font-semibold text-zinc-900">
                    {item.title}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-600">
                    {item.description}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
