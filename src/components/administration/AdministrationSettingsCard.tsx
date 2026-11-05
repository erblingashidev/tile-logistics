"use client";

import { useEffect, useState } from "react";
import type { AdministrationSettings } from "@/lib/administration/administration-settings-shared";
import { useAdministrationSettings } from "@/components/administration/AdministrationSettingsProvider";
import { useAppMessages } from "@/components/i18n/LocaleProvider";
import { Alert, Card, Switch } from "@/components/ui";

export function AdministrationSettingsCard() {
  const t = useAppMessages();
  const { settings: contextSettings, refresh } = useAdministrationSettings();
  const [settings, setSettings] = useState<AdministrationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setSettings(contextSettings);
    setLoading(false);
  }, [contextSettings]);

  async function patchSettings(patch: Partial<AdministrationSettings>) {
    if (!settings) return;
    setSaving(true);
    setError("");
    setSuccess("");
    const previous = settings;
    setSettings({ ...settings, ...patch });
    const res = await fetch("/api/administration/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setSettings(previous);
      setError(data.error ?? t.settings.administration.saveFailed);
      return;
    }
    setSettings(data.settings);
    await refresh();
    setSuccess(t.settings.administration.saved);
    setTimeout(() => setSuccess(""), 4000);
  }

  return (
    <Card className="space-y-6 p-5">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
          {t.settings.administration.section}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-zinc-900">
          {t.settings.administration.financeModeTitle}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600">
          {t.settings.administration.financeModeDesc}
        </p>
      </div>
      {error ? (
        <Alert tone="error">{error}</Alert>
      ) : null}
      {success ? (
        <Alert tone="info">{success}</Alert>
      ) : null}
      {loading ? (
        <p className="text-sm text-zinc-500">{t.common.loading}</p>
      ) : settings ? (
        <>
          <Switch
            label={t.settings.administration.cashRegisterEnabled}
            description={t.settings.administration.cashRegisterEnabledDesc}
            status={
              settings.cashRegisterEnabled
                ? t.settings.administration.registerOn
                : t.settings.administration.registerOff
            }
            checked={settings.cashRegisterEnabled}
            disabled={saving}
            onCheckedChange={(v) => void patchSettings({ cashRegisterEnabled: v })}
          />
          {settings.cashRegisterEnabled ? (
            <div className="border-t border-zinc-100 pt-5">
              <h3 className="text-base font-semibold text-zinc-900">
                {t.settings.administration.cashRegisterRules}
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-zinc-600">
                {t.settings.administration.strictHelp}
              </p>
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
                  onCheckedChange={(v) =>
                    void patchSettings({ registerStrictTraceability: v })
                  }
                />
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
