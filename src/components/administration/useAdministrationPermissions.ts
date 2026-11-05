"use client";

import { useCallback, useEffect, useState } from "react";

type AdministrationPermissions = {
  loading: boolean;
  canReports: boolean;
  canApprove: boolean;
};

export function useAdministrationPermissions(): AdministrationPermissions {
  const [loading, setLoading] = useState(true);
  const [canReports, setCanReports] = useState(false);
  const [canApprove, setCanApprove] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const perms: string[] = data?.permissions ?? [];
      const isAdmin = data?.user?.role === "admin";
      setCanApprove(
        isAdmin || perms.includes("administration:approve")
      );
      setCanReports(
        isAdmin ||
          perms.includes("administration:reports") ||
          perms.includes("administration:approve")
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { loading, canReports, canApprove };
}
