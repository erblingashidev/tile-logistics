"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Map, {
  Marker,
  NavigationControl,
  Popup,
  type MapRef,
} from "react-map-gl/maplibre";
import { Badge, Card, EmptyState, LoadingState } from "@/components/ui";
import type { WorkDayFilter } from "@/lib/delivery-schedule";
import {
  getMapAttribution,
  getMapStyleUrl,
  KOSOVO_MAP_BOUNDS,
  KOSOVO_MAP_CENTER,
} from "@/lib/locations/map-config";
import type { MapPin } from "@/lib/locations/map-pins";

interface WarehouseLocation {
  lat: number;
  lng: number;
  name: string;
}

export interface KosovoOrderMapFilters {
  region?: string;
  unassigned?: boolean;
  workDay?: WorkDayFilter;
}

interface MapOrdersResponse {
  warehouse: WarehouseLocation;
  pins: MapPin[];
  orderCount: number;
  pinCount: number;
  streetPins: number;
  cityPins: number;
}

function PinMarker({
  pin,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  pin: MapPin;
  selected: boolean;
  hovered: boolean;
  onSelect: () => void;
  onHover: (active: boolean) => void;
}) {
  const isStreet = pin.precision === "street";
  const showLabel = isStreet && (hovered || selected);
  const showCount = !isStreet && pin.count > 1;

  return (
    <Marker
      longitude={pin.lng}
      latitude={pin.lat}
      anchor="center"
      onClick={(e) => {
        e.originalEvent.stopPropagation();
        onSelect();
      }}
    >
      <div
        className="relative flex flex-col items-center"
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
      >
        {showLabel ? (
          <div className="pointer-events-none absolute bottom-full mb-1 max-w-[10rem] truncate rounded bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-white shadow">
            {pin.label}
          </div>
        ) : null}
        <div
          className={`relative flex h-5 w-5 items-center justify-center rounded-full border-2 border-white shadow-md ${
            isStreet ? "bg-blue-500" : "bg-amber-500"
          } ${selected ? "ring-2 ring-zinc-900 ring-offset-1" : ""}`}
        >
          {showCount ? (
            <span className="text-[10px] font-bold leading-none text-white">
              {pin.count}
            </span>
          ) : null}
        </div>
      </div>
    </Marker>
  );
}

function WarehouseMarker({ warehouse }: { warehouse: WarehouseLocation }) {
  return (
    <Marker longitude={warehouse.lng} latitude={warehouse.lat} anchor="center">
      <div
        className="flex h-6 w-6 items-center justify-center rounded border-2 border-white bg-emerald-600 shadow-md"
        title={warehouse.name}
      >
        <span className="text-[10px] font-bold text-white">W</span>
      </div>
    </Marker>
  );
}

export function KosovoOrderMap({
  filters,
  height = 520,
  mapStyleUrl = getMapStyleUrl(),
  mapAttribution = getMapAttribution(),
  onLoaded,
}: {
  filters?: KosovoOrderMapFilters;
  height?: number | string;
  mapStyleUrl?: string;
  mapAttribution?: string;
  onLoaded?: (stats: Pick<MapOrdersResponse, "orderCount" | "streetPins" | "cityPins">) => void;
}) {
  const mapRef = useRef<MapRef>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<MapOrdersResponse | null>(null);
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters?.region) params.set("region", filters.region);
    if (filters?.unassigned) params.set("unassigned", "true");
    if (filters?.workDay && filters.workDay !== "all") {
      params.set("workDay", filters.workDay);
    }
    return params.toString();
  }, [filters?.region, filters?.unassigned, filters?.workDay]);

  const fitToPins = useCallback((pins: MapPin[], warehouse: WarehouseLocation) => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const points: [number, number][] = [
      [warehouse.lng, warehouse.lat],
      ...pins.map((p) => [p.lng, p.lat] as [number, number]),
    ];

    if (points.length === 1) {
      map.flyTo({ center: points[0], zoom: 11, duration: 800 });
      return;
    }

    let minLng = points[0]![0];
    let maxLng = points[0]![0];
    let minLat = points[0]![1];
    let maxLat = points[0]![1];
    for (const [lng, lat] of points) {
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }

    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 48, maxZoom: 13, duration: 800 }
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setSelectedPin(null);

    void (async () => {
      try {
        const res = await fetch(
          `/api/map/orders${queryString ? `?${queryString}` : ""}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error("Failed to load map data");
        const json = (await res.json()) as MapOrdersResponse;
        if (cancelled) return;
        setData(json);
        onLoaded?.({
          orderCount: json.orderCount,
          streetPins: json.streetPins,
          cityPins: json.cityPins,
        });
        requestAnimationFrame(() => fitToPins(json.pins, json.warehouse));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load map");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [queryString, fitToPins, onLoaded]);

  if (loading) {
    return (
      <Card className="overflow-hidden">
        <LoadingState title="Loading delivery map…" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="overflow-hidden p-4">
        <p className="text-sm text-red-700">{error}</p>
      </Card>
    );
  }

  if (!data || data.pins.length === 0) {
    return (
      <Card className="overflow-hidden">
        <EmptyState title="No active orders to show on the map" />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="relative" style={{ height }}>
        <Map
          ref={mapRef}
          initialViewState={{
            longitude: KOSOVO_MAP_CENTER.lng,
            latitude: KOSOVO_MAP_CENTER.lat,
            zoom: 8,
          }}
          maxBounds={KOSOVO_MAP_BOUNDS}
          style={{ width: "100%", height: "100%" }}
          mapStyle={mapStyleUrl}
          onClick={() => setSelectedPin(null)}
        >
          <NavigationControl position="top-right" showCompass={false} />
          <WarehouseMarker warehouse={data.warehouse} />
          {data.pins.map((pin) => (
            <PinMarker
              key={pin.id}
              pin={pin}
              selected={selectedPin?.id === pin.id}
              hovered={hoveredPinId === pin.id}
              onSelect={() => setSelectedPin(pin)}
              onHover={(active) => setHoveredPinId(active ? pin.id : null)}
            />
          ))}
          {selectedPin ? (
            <Popup
              longitude={selectedPin.lng}
              latitude={selectedPin.lat}
              anchor="bottom"
              closeOnClick={false}
              onClose={() => setSelectedPin(null)}
              maxWidth="280px"
            >
              <div className="space-y-2 p-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-zinc-900">
                    {selectedPin.label}
                  </p>
                  <Badge tone={selectedPin.precision === "street" ? "blue" : "amber"}>
                    {selectedPin.precision === "street" ? "Street" : "City"}
                  </Badge>
                </div>
                <p className="text-xs text-zinc-500">
                  {selectedPin.city}, {selectedPin.region}
                  {selectedPin.count > 1 ? ` · ${selectedPin.count} orders` : ""}
                </p>
                <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
                  {selectedPin.orders.map((order) => (
                    <li
                      key={order.id}
                      className="rounded border border-zinc-100 bg-zinc-50 px-2 py-1.5"
                    >
                      <Link
                        href="/orders"
                        className="font-medium text-zinc-900 hover:underline"
                      >
                        {order.invoiceNumber}
                      </Link>
                      <p className="text-xs text-zinc-600">{order.customerName}</p>
                      <p className="text-xs text-zinc-500">{order.location}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </Popup>
          ) : null}
        </Map>
        <p className="pointer-events-none absolute bottom-1 right-2 rounded bg-white/80 px-1.5 py-0.5 text-[10px] text-zinc-500">
          {mapAttribution}
        </p>
      </div>
    </Card>
  );
}

export type { MapOrdersResponse };
