"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PortalCard,
  PortalSectionTitle,
  PortalShell,
} from "@/components/portal/PortalShell";
import { ChangePasswordCard } from "@/components/portal/ChangePasswordCard";
import { Alert, Badge, LoadingState } from "@/components/ui";
import { sq } from "@/lib/i18n/sq";
import type { EmployeeRole } from "@/lib/constants";
import { WAREHOUSE_REPORT_ROLES } from "@/lib/employee-categories";

interface MeUser {
  name?: string;
  username?: string | null;
  roles?: EmployeeRole[];
  status?: string;
}

export default function PortalProfilePage() {
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
      setError(sq.errors.generic);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const roles = user?.roles ?? [];
  const showWms = roles.some((r) =>
    (
      [
        "warehouse_admin",
        "warehouse_reporter",
        "group_leader",
        "picker",
        "unloader",
        "maintainer",
      ] as EmployeeRole[]
    ).includes(r)
  );
  const showReports = roles.some((r) => WAREHOUSE_REPORT_ROLES.includes(r));

  return (
    <PortalShell
      title={sq.profileTitle}
      subtitle={user?.name}
      activeNav="profile"
      showOrders
      showWms={showWms}
      showReports={showReports}
      onLogout={logout}
    >
      {loading ? (
        <PortalCard>
          <LoadingState title={sq.profileLoading} />
        </PortalCard>
      ) : error || !user ? (
        <Alert tone="error">{error || sq.errors.generic}</Alert>
      ) : (
        <>
          <PortalCard className="space-y-3">
            <PortalSectionTitle>{sq.profileAccount}</PortalSectionTitle>
            <div>
              <p className="text-lg font-semibold text-zinc-900">
                {user.name ?? "—"}
              </p>
              {user.username && (
                <p className="mt-1 text-sm text-zinc-600">@{user.username}</p>
              )}
            </div>
            {user.status && (
              <div>
                <p className="text-xs text-zinc-500">{sq.profileStatus}</p>
                <Badge tone="slate">{user.status}</Badge>
              </div>
            )}
            {roles.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs text-zinc-500">{sq.profileRoles}</p>
                <div className="flex flex-wrap gap-1.5">
                  {roles.map((role) => (
                    <Badge key={role} tone="blue">
                      {role}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </PortalCard>

          <ChangePasswordCard
            defaultOpen
            labels={{
              title: sq.changePasswordTitle,
              currentPassword: sq.currentPassword,
              newPassword: sq.newPassword,
              confirmPassword: sq.confirmPassword,
              save: sq.updatePassword,
              success: sq.passwordUpdated,
              toggleShow: sq.showPassword,
              toggleHide: sq.hidePassword,
            }}
          />
        </>
      )}
    </PortalShell>
  );
}
