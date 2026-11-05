"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_ADMINISTRATION_SETTINGS,
  type AdministrationSettings,
} from "@/lib/administration/administration-settings-shared";

type AdministrationSettingsContextValue = {
  settings: AdministrationSettings;
  loading: boolean;
  refresh: () => Promise<void>;
  cashRegisterEnabled: boolean;
};

const AdministrationSettingsContext =
  createContext<AdministrationSettingsContextValue | null>(null);

export function AdministrationSettingsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [settings, setSettings] = useState<AdministrationSettings>(
    DEFAULT_ADMINISTRATION_SETTINGS
  );
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/administration/settings", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { settings?: AdministrationSettings };
      if (data.settings) setSettings(data.settings);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      settings,
      loading,
      refresh,
      cashRegisterEnabled: settings.cashRegisterEnabled,
    }),
    [settings, loading, refresh]
  );

  return (
    <AdministrationSettingsContext.Provider value={value}>
      {children}
    </AdministrationSettingsContext.Provider>
  );
}

export function useAdministrationSettings() {
  const ctx = useContext(AdministrationSettingsContext);
  if (!ctx) {
    return {
      settings: DEFAULT_ADMINISTRATION_SETTINGS,
      loading: false,
      refresh: async () => {},
      cashRegisterEnabled: DEFAULT_ADMINISTRATION_SETTINGS.cashRegisterEnabled,
    };
  }
  return ctx;
}
