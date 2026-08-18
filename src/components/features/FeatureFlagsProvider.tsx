"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  FEATURE_FLAG_DEFAULTS,
  parseFeatureFlags,
  type FeatureFlags,
} from "@/lib/features/catalog";

const FeatureFlagsContext = createContext<FeatureFlags>(FEATURE_FLAG_DEFAULTS);

const FEATURE_FLAGS_EVENT = "tile-feature-flags";

export function FeatureFlagsProvider({
  children,
  initial,
}: {
  children: ReactNode;
  initial?: FeatureFlags;
}) {
  const [flags, setFlags] = useState<FeatureFlags>(
    initial ?? FEATURE_FLAG_DEFAULTS
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/features", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setFlags(parseFeatureFlags(data));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onUpdate(event: Event) {
      const detail = (event as CustomEvent<FeatureFlags>).detail;
      if (detail) setFlags(parseFeatureFlags(detail));
    }
    window.addEventListener(FEATURE_FLAGS_EVENT, onUpdate);
    return () => window.removeEventListener(FEATURE_FLAGS_EVENT, onUpdate);
  }, []);

  const value = useMemo(() => flags, [flags]);

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags(): FeatureFlags {
  return useContext(FeatureFlagsContext);
}

export function broadcastFeatureFlags(flags: FeatureFlags) {
  window.dispatchEvent(
    new CustomEvent(FEATURE_FLAGS_EVENT, { detail: flags })
  );
}
