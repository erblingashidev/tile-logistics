"use client";

import { useEffect, useState } from "react";
import type { AdministrationSettings } from "@/lib/services/administration-settings";
import { useAppMessages } from "@/components/i18n/LocaleProvider";
import { Alert, Card, Switch } from "@/components/ui";

export function AdministrationSettingsCard() {
  const t = useAppMessages();
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
      .catch(() => setError(t.settings.administration.loadFailed))
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
      setError(data.error ?? t.settings.administration.saveFailed);
      return;
    }
    setSettings(data.settings);
    setSuccess(
      enabled
        ? t.settings.administration.strictEnabled
        : t.settings.administration.relaxedEnabled
    );
    setTimeout(() => setSuccess(""), 4000);
  }

  return (
    <Card className="p-5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        {t.settings.administration.section}
      </p>
      <h2 className="mt-1 text-lg font-semibold text-zinc-900">
        {t.settings.administration.cashRegisterRules}
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-zinc-600">
        {t.settings.administration.strictHelp}
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
        <p className="mt-4 text-sm text-zinc-500">{t.common.loading}</p>
      ) : settings ? (
        <div className="mt-4">
          <Switch
            label={t.settings.administration.strictTraceability}
            description={t.settings.administration.strictDesc}
            status={
              settings.registerStrictTraceability
                ? t.settings.administration.strictOn
                : t.settings.administration.relaxed
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
