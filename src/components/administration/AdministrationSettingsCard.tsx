"use client";

import { useEffect, useState } from "react";
import type { AdministrationSettings } from "@/lib/services/administration-settings";
import { Alert, Card, Switch } from "@/components/ui";

export function AdministrationSettingsCard() {
  const [settings, setSettings] = useState<AdministrationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetch("/api/administration/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        setSettings(data.settings ?? { registerStrictTraceability: false });
      })
      .catch(() => setError("Could not load administration settings."))
      .finally(() => setLoading(false));
  }, []);

  async function toggleStrict(enabled: boolean) {
    if (!settings) return;
    setSaving(true);
    setError("");
    setSuccess("");
    const previous = settings;
    setSettings({ ...settings, registerStrictTraceability: enabled });
    const res = await fetch("/api/administration/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registerStrictTraceability: enabled }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setSettings(previous);
      setError(data.error ?? "Could not save.");
      return;
    }
    setSettings(data.settings);
    setSuccess(
      enabled
        ? "Strict register rules enabled on the cash register page."
        : "Cash register uses relaxed entry rules."
    );
    setTimeout(() => setSuccess(""), 4000);
  }

  return (
    <Card className="p-5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        Administration
      </p>
      <h2 className="mt-1 text-lg font-semibold text-zinc-900">
        Cash register rules
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-zinc-600">
        Finance and client follow-up always require invoice numbers and sales
        agents on debts and call lists. This switch only controls whether the
        cash register page enforces those fields on every new line.
      </p>
      {error ? (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}
      {success ? (
        <div className="mt-3">
          <Alert tone="info">{success}</Alert>
        </div>
      ) : null}
      {loading ? (
        <p className="mt-4 text-sm text-zinc-500">Loading…</p>
      ) : settings ? (
        <div className="mt-4">
          <Switch
            label="Strict traceability on cash register"
            description="Require invoice/receipt on every line; customer + sales agent on payments and refunds."
            status={
              settings.registerStrictTraceability ? "Strict" : "Relaxed"
            }
            checked={settings.registerStrictTraceability}
            disabled={saving}
            onCheckedChange={(v) => void toggleStrict(v)}
          />
        </div>
      ) : null}
    </Card>
  );
}
