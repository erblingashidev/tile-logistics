"use client";

import { useEffect, useState } from "react";
import type { MapTileProvider } from "@/lib/locations/map-config";

export interface MapStyleConfig {
  styleUrl: string;
  attribution: string;
  provider: MapTileProvider;
  hasKey: boolean;
}

export function useMapStyle() {
  const [config, setConfig] = useState<MapStyleConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/map/config", { cache: "no-store" });
        if (!res.ok) throw new Error("Could not load map configuration");
        const json = (await res.json()) as MapStyleConfig;
        if (!cancelled) setConfig(json);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load map configuration"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { config, loading, error };
}
