"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClientFinanceProfile } from "@/components/administration/AdministrationClientFinance";
import type { FinanceDebtsPayload } from "@/components/administration/finance/finance-debt-types";

export function useFinanceDebts(overdueDays = 14) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<FinanceDebtsPayload | null>(null);
  const [selected, setSelected] = useState<ClientFinanceProfile | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/administration/clients?overdueDays=${overdueDays}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load finance data");
      setData(json as FinanceDebtsPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [overdueDays]);

  const openClient = useCallback(async (clientKey: string) => {
    setError("");
    const res = await fetch(
      `/api/administration/clients?clientKey=${encodeURIComponent(clientKey)}`,
      { cache: "no-store" }
    );
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Could not load client");
      return;
    }
    setSelected(json.profile);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    loading,
    error,
    data,
    selected,
    setSelected,
    openClient,
    reload: load,
  };
}
