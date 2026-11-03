"use client";

import { useState } from "react";
import { Button, Card, Input, Alert } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useAppMessages } from "@/components/i18n/LocaleProvider";

export default function LoginPage() {
  const t = useAppMessages();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 400) {
          setError(t.login.required);
        } else if (res.status === 401) {
          setError(t.login.invalid);
        } else {
          setError(data.error ?? t.login.failed);
        }
        return;
      }
      window.location.href = data.redirect ?? "/";
      return;
    } catch {
      setError(t.login.connect);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-4">
      <Card className="relative w-full max-w-md p-6">
        <div className="absolute right-4 top-4">
          <LanguageSwitcher compact />
        </div>
        <p className="text-lg font-semibold text-zinc-900">{BRAND.name}</p>
        <p className="mt-1 text-sm text-zinc-500">{t.login.subtitle}</p>
        <p className="mt-4 text-base font-medium text-zinc-900">{t.login.title}</p>
        <p className="mt-2 text-sm text-zinc-600">{t.login.existingAccount}</p>
        <p className="mt-1 text-xs text-zinc-500">{t.login.usernameHint}</p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <Input
            label={t.login.username}
            autoComplete="username"
            placeholder="e.g. erblingashi"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <Input
            label={t.login.password}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t.login.submitting : t.login.submit}
          </Button>
        </form>
      </Card>
    </div>
  );
}
