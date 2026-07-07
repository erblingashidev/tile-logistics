"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { ChangePasswordCard } from "@/components/portal/ChangePasswordCard";
import { Badge, Card, LoadingState } from "@/components/ui";

interface AdminProfile {
  role: "admin";
  adminId: number;
  name: string;
  username: string;
  title?: string | null;
  email?: string | null;
  isActive?: boolean;
  createdAt?: string | null;
  lastLoginAt?: string | null;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Unauthorized");
        const data = await res.json();
        if (data.user?.role !== "admin") throw new Error("Forbidden");
        setProfile(data.user);
      })
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell
      title="Profile"
      description="Your admin account and password"
    >
      {loading ? (
        <LoadingState title="Loading profile…" />
      ) : !profile ? (
        <Card className="p-5 text-sm text-zinc-600">
          Could not load your profile. Try logging in again.
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  {profile.name}
                </h2>
                {profile.title ? (
                  <p className="mt-1 text-sm text-zinc-600">{profile.title}</p>
                ) : null}
              </div>
              <Badge tone={profile.isActive === false ? "red" : "green"}>
                {profile.isActive === false ? "Inactive" : "Active"}
              </Badge>
            </div>

            <dl className="mt-5 space-y-3 text-sm">
              <div>
                <dt className="text-zinc-500">Username</dt>
                <dd className="font-medium text-zinc-900">{profile.username || "—"}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Email</dt>
                <dd className="font-medium text-zinc-900">
                  {profile.email?.trim() || "—"}
                </dd>
              </div>
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

            <p className="mt-5 text-xs text-zinc-500">
              Need to add another manager or CEO?{" "}
              <Link href="/admins" className="font-medium text-zinc-800 underline">
                Manage admin users
              </Link>
            </p>
          </Card>

          <ChangePasswordCard variant="admin" defaultOpen />
        </div>
      )}
    </AppShell>
  );
}
