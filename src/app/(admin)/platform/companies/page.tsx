"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, Badge, Button, Card, Input, LoadingState } from "@/components/ui";
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
  const [deleteTarget, setDeleteTarget] = useState<Organization | null>(null);
  const [deleteSlug, setDeleteSlug] = useState("");
  const [deleting, setDeleting] = useState(false);

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

  async function confirmDeleteCompany() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(
        `/api/platform/organizations/${deleteTarget.id}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmSlug: deleteSlug }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not delete company.");
        return;
      }
      setDeleteTarget(null);
      setDeleteSlug("");
      await load();
    } catch {
      setError("Could not delete company.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppShell
      title="Choose company"
      description={`${BRAND.name} — platform operator`}
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
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  disabled={org.status !== "active" || busyId === org.id}
                  onClick={() => enterCompany(org.id)}
                >
                  {busyId === org.id ? "Opening…" : "Open company"}
                </Button>
                {org.id !== 1 ? (
                  <Button
                    variant="secondary"
                    disabled={deleting}
                    onClick={() => {
                      setDeleteTarget(org);
                      setDeleteSlug("");
                    }}
                  >
                    Delete…
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md p-6">
            <p className="text-lg font-semibold text-zinc-900">Delete company</p>
            <p className="mt-2 text-sm text-zinc-600">
              This permanently removes{" "}
              <span className="font-medium">{deleteTarget.name}</span>, all
              users, orders, and warehouse data. Type{" "}
              <span className="font-mono text-zinc-900">{deleteTarget.slug}</span>{" "}
              to confirm.
            </p>
            <div className="mt-4">
              <Input
                label="Company slug"
                value={deleteSlug}
                onChange={(e) => setDeleteSlug(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="secondary"
                disabled={deleting}
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteSlug("");
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={
                  deleting ||
                  deleteSlug.trim().toLowerCase() !== deleteTarget.slug
                }
                onClick={() => void confirmDeleteCompany()}
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </AppShell>
  );
}
