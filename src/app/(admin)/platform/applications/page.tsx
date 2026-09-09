"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Alert, Badge, Button, Card, LoadingState } from "@/components/ui";

type Application = {
  id: number;
  orgName: string;
  slug: string;
  contactName: string;
  contactEmail: string;
  adminUsername: string;
  companyCategory: string;
  message: string | null;
  createdAt: string;
};

export default function PlatformApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/platform/applications", {
        cache: "no-store",
      });
      if (res.status === 403) {
        setError("Platform admin access required.");
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setApplications(data.applications ?? []);
    } catch {
      setError("Could not load applications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function review(id: number, action: "approve" | "reject") {
    let reason: string | undefined;
    if (action === "reject") {
      reason = window.prompt("Rejection reason (optional)") ?? undefined;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/platform/applications/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Action failed.");
        return;
      }
      await load();
    } catch {
      setError("Action failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell
      title="Signup applications"
      description="Approve new companies before they can complete setup"
    >
      {error && <Alert tone="error">{error}</Alert>}

      {loading ? (
        <LoadingState title="Loading applications…" />
      ) : applications.length === 0 ? (
        <Card className="p-6 text-sm text-zinc-500">
          No pending applications.
        </Card>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => (
            <Card key={app.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-zinc-900">
                    {app.orgName}
                  </p>
                  <p className="text-sm text-zinc-500">/{app.slug}</p>
                </div>
                <Badge tone="amber">Pending</Badge>
              </div>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-zinc-500">Contact</dt>
                  <dd className="font-medium text-zinc-900">
                    {app.contactName} · {app.contactEmail}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Admin login</dt>
                  <dd className="font-medium text-zinc-900">
                    {app.adminUsername}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Category</dt>
                  <dd className="font-medium text-zinc-900">
                    {app.companyCategory}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Submitted</dt>
                  <dd className="font-medium text-zinc-900">
                    {new Date(app.createdAt).toLocaleString()}
                  </dd>
                </div>
              </dl>
              {app.message && (
                <p className="mt-3 rounded bg-zinc-50 p-3 text-sm text-zinc-700">
                  {app.message}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  disabled={busyId === app.id}
                  onClick={() => review(app.id, "approve")}
                >
                  Approve
                </Button>
                <Button
                  variant="secondary"
                  disabled={busyId === app.id}
                  onClick={() => review(app.id, "reject")}
                >
                  Reject
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
