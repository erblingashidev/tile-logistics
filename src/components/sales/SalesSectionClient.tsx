"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isSalesAdmin } from "@/lib/employee-categories";
import type { EmployeeRole } from "@/lib/constants";
import { SalesShell } from "@/components/sales/SalesShell";

export function SalesSectionClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);
  const [roles, setRoles] = useState<EmployeeRole[]>([]);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setUserName(data?.user?.name ?? null);
        setRoles((data?.user?.roles as EmployeeRole[]) ?? []);
      })
      .catch(() => undefined);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <SalesShell
      userName={userName}
      isAdmin={isSalesAdmin(roles)}
      onLogout={logout}
    >
      {children}
    </SalesShell>
  );
}
