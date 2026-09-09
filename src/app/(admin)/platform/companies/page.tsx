"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, Badge, Button, Card, LoadingState } from "@/components/ui";
import { BRAND } from "@/lib/brand";

type Organization = {
  id: number;
  slug: string;
  name: string;
  status: string;
  onboardingComplete: boolean;
};

export default function PlatformCompaniesPage() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/platform/organizations", {
        cache: "no-store",
      });
      if (res.status === 403) {
        setError("Platform admin access required.");
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setOrganizations(data.organizations ?? []);
    } catch {
      setError("Could not load companies.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function enterCompany(organizationId: number) {
    setBusyId(organizationId);
    setError("");
    try {
      const res = await fetch("/api/platform/switch-organization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not open that company.");
        return;
      }
      router.push(data.redirect ?? "/");
      router.refresh();
    } catch {
      setError("Could not open that company.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell
      title="Choose company"
      description={`${BRAND.name} — select which company you want to manage`}
      contentMaxWidth="default"
    >
      {error && <Alert tone="error">{error}</Alert>}

      {loading ? (
        <LoadingState title="Loading companies…" />
      ) : organizations.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-zinc-600">No companies yet.</p>
          <Button
            className="mt-4"
            variant="secondary"
            onClick={() => router.push("/platform/applications")}
          >
            Review signup applications
          </Button>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {organizations.map((org) => (
            <Card key={org.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-zinc-900">{org.name}</p>
                  <p className="mt-1 text-xs text-zinc-500">{org.slug}</p>
                </div>
                <Badge tone={org.status === "active" ? "green" : "slate"}>
                  {org.status}
                </Badge>
              </div>
              {!org.onboardingComplete && org.status === "active" ? (
                <p className="mt-3 text-xs text-amber-700">Setup not finished</p>
              ) : null}
              <div className="mt-4">
                <Button
                  disabled={org.status !== "active" || busyId === org.id}
                  onClick={() => enterCompany(org.id)}
                >
                  {busyId === org.id ? "Opening…" : "Open company"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
