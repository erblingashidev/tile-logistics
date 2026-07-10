"use client";

import { useCallback, useState } from "react";
import Map, { Marker, NavigationControl, type MapLayerMouseEvent } from "react-map-gl/maplibre";
import { Alert, LoadingState } from "@/components/ui";
import type { LocationValue } from "@/components/LocationPicker";
import {
  KOSOVO_MAP_BOUNDS,
  KOSOVO_MAP_CENTER,
} from "@/lib/locations/map-config";
import { useMapStyle } from "@/hooks/useMapStyle";

interface ReverseGeocodeLocation {
  id: string;
  name: string;
  city: string;
  region: string;
  lat: number;
  lng: number;
}

export function LocationMapPicker({
  region,
  lat: initialLat,
  lng: initialLng,
  onChange,
  height = 280,
}: {
  region?: string;
  lat?: number;
  lng?: number;
  onChange: (loc: LocationValue) => void;
  height?: number;
}) {
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(() =>
    initialLat != null && initialLng != null
      ? { lat: initialLat, lng: initialLng }
      : null
  );
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState("");
  const [mapTileError, setMapTileError] = useState("");
  const { config: mapStyle, loading: styleLoading, error: styleError } = useMapStyle();

  const reverseGeocode = useCallback(
    async (lat: number, lng: number) => {
      setGeocoding(true);
      setError("");
      try {
        const params = new URLSearchParams({
          reverse: "true",
          lat: String(lat),
          lng: String(lng),
        });
        const res = await fetch(`/api/locations?${params}`);
        if (!res.ok) throw new Error("Reverse geocode failed");
        const data = (await res.json()) as {
          location: ReverseGeocodeLocation | null;
        };
        const loc = data.location;
        onChange({
          region: loc?.region || region || "",
          locationDetail: loc?.name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
          id: loc?.id,
          city: loc?.city,
          lat,
          lng,
        });
      } catch {
        setError("Could not resolve address for this point.");
        onChange({
          region: region || "",
          locationDetail: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
          lat,
          lng,
        });
      } finally {
        setGeocoding(false);
      }
    },
    [onChange, region]
  );

  const handlePosition = useCallback(
    (lng: number, lat: number) => {
      setPin({ lat, lng });
      void reverseGeocode(lat, lng);
    },
    [reverseGeocode]
  );

  function onMapClick(e: MapLayerMouseEvent) {
    handlePosition(e.lngLat.lng, e.lngLat.lat);
  }

  return (
    <div className="space-y-2">
      {mapStyle?.hint ? <Alert tone="warning">{mapStyle.hint}</Alert> : null}
      {styleError ? <Alert tone="error">{styleError}</Alert> : null}
      {mapTileError ? <Alert tone="warning">{mapTileError}</Alert> : null}
      <div
        className="relative overflow-hidden rounded border border-zinc-200"
        style={{ height }}
      >
        {styleLoading || !mapStyle ? (
          <div className="flex h-full items-center justify-center bg-zinc-50">
            <LoadingState title="Loading map…" />
          </div>
        ) : (
        <Map
          initialViewState={{
            longitude: pin?.lng ?? initialLng ?? KOSOVO_MAP_CENTER.lng,
            latitude: pin?.lat ?? initialLat ?? KOSOVO_MAP_CENTER.lat,
            zoom: pin || initialLat != null ? 12 : 8,
          }}
          maxBounds={KOSOVO_MAP_BOUNDS}
          style={{ width: "100%", height: "100%" }}
          mapStyle={mapStyle.styleUrl}
          onClick={onMapClick}
          cursor={geocoding ? "wait" : "crosshair"}
          onError={(e) =>
            setMapTileError(
              e.error?.message?.includes("403")
                ? "Map tiles blocked — check the MapTiler API key and allowed domains."
                : "Map tiles failed to load."
            )
          }
        >
          <NavigationControl position="top-right" showCompass={false} />
          {pin ? (
            <Marker
              longitude={pin.lng}
              latitude={pin.lat}
              anchor="bottom"
              draggable
              onDragEnd={(e) =>
                handlePosition(e.lngLat.lng, e.lngLat.lat)
              }
            >
              <div className="h-6 w-6 -translate-y-1 rounded-full border-2 border-white bg-blue-500 shadow-md" />
            </Marker>
          ) : null}
        </Map>
        )}
        {geocoding ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/40">
            <LoadingState title="Looking up address…" />
          </div>
        ) : null}
        {mapStyle ? (
        <p className="pointer-events-none absolute bottom-1 right-2 rounded bg-white/80 px-1.5 py-0.5 text-[10px] text-zinc-500">
          {mapStyle.attribution}
        </p>
        ) : null}
      </div>
      <p className="text-xs text-zinc-500">
        Click the map to drop a pin, or drag the pin to adjust.
      </p>
      {error ? <Alert tone="warning">{error}</Alert> : null}
    </div>
  );
}
