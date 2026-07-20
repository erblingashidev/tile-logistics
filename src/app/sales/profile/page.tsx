"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChangePasswordCard } from "@/components/portal/ChangePasswordCard";
import { Alert, Badge, Card, LoadingState } from "@/components/ui";

interface MeUser {
  name?: string;
  username?: string | null;
  roles?: string[];
}

export default function SalesProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<MeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      setUser(data.user ?? null);
    } catch {
      setError("Could not load profile");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Card className="p-5">
        <LoadingState title="Loading profile…" />
      </Card>
    );
  }

  if (error || !user) {
    return <Alert tone="error">{error || "Could not load profile"}</Alert>;
  }

  return (
    <>
      <Card className="space-y-3 p-5">
        <h2 className="text-sm font-semibold text-zinc-900">Account</h2>
        <div>
          <p className="text-lg font-semibold text-zinc-900">
            {user.name ?? "—"}
          </p>
          {user.username && (
            <p className="mt-1 text-sm text-zinc-600">@{user.username}</p>
          )}
        </div>
        {(user.roles?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {user.roles!.map((role) => (
              <Badge key={role} tone="blue">
                {role}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      <ChangePasswordCard defaultOpen />
    </>
  );
}
