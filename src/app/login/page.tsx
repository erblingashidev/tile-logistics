"use client";

import { useState } from "react";
import { Button, Card, Input, Alert } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { sq } from "@/lib/i18n/sq";

export default function LoginPage() {
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
          setError(sq.login.required);
        } else if (res.status === 401) {
          setError(sq.login.invalid);
        } else {
          setError(data.error ?? sq.login.failed);
        }
        return;
      }
      // Full navigation so the session cookie is picked up before middleware runs.
      window.location.href = data.redirect ?? "/";
      return;
    } catch {
      setError(sq.login.connect);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-4">
      <Card className="w-full max-w-md p-6">
        <p className="text-lg font-semibold text-zinc-900">{BRAND.name}</p>
        <p className="mt-1 text-sm text-zinc-500">{sq.login.subtitle}</p>
        <p className="mt-4 text-base font-medium text-zinc-900">{sq.login.title}</p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <Input
            label={sq.login.username}
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <Input
            label={sq.login.password}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? sq.login.submitting : sq.login.submit}
          </Button>
        </form>
      </Card>
    </div>
  );
}
