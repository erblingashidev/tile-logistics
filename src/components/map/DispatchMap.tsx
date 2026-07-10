"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Popup,
  Source,
  type MapRef,
} from "react-map-gl/maplibre";
import { Badge, Card, EmptyState, LoadingState } from "@/components/ui";
import {
  getMapAttribution,
  getMapStyleUrl,
  KOSOVO_MAP_BOUNDS,
  KOSOVO_MAP_CENTER,
} from "@/lib/locations/map-config";
import { orderStopsForRoundTrip } from "@/lib/dispatch/route-cluster";
import { WAREHOUSE_LOCATION } from "@/lib/locations";

interface MapStop {
  id: number;
  lat: number;
  lng: number;
  invoiceNumber: string;
  customerName: string;
  location: string;
  sequence: number;
}

interface MapUnassignedOrder {
  id: number;
  lat: number;
  lng: number;
  invoiceNumber: string;
  customerName: string;
  location: string;
  region: string;
  priority: "normal" | "urgent";
  totalPallets: number;
}

interface MapTruckRound {
  round: number;
  status: string;
  statusLabel: string;
  totalPallets: number;
  maxPallets: number;
  spreadKm: number;
  regions: string[];
  stops: MapStop[];
  routeCoordinates: [number, number][];
}

interface MapTruck {
  vehicleId: number;
  name: string;
  plateNumber: string;
  driverName: string | null;
  color: string;
  rounds: MapTruckRound[];
}

interface PlanRecommendation {
  id: string;
  vehicleId: number;
  vehicleName: string;
  orders: Array<{ id: number; lat: number; lng: number; invoiceNumber: string }>;
}

interface DispatchMapData {
  warehouse: { lat: number; lng: number; name: string };
  unassigned: MapUnassignedOrder[];
  trucks: MapTruck[];
  missingGeo: number;
  plan?: {
    recommendations: PlanRecommendation[];
  };
}

type SelectedPin =
  | { kind: "unassigned"; order: MapUnassignedOrder }
  | {
      kind: "assigned";
      stop: MapStop;
      truck: MapTruck;
    };

function WarehouseMarker({ warehouse }: { warehouse: { lat: number; lng: number; name: string } }) {
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

function OrderPin({
  lat,
  lng,
  color,
  borderColor,
  label,
  selected,
  onSelect,
}: {
  lat: number;
  lng: number;
  color: string;
  borderColor?: string;
  label?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Marker
      longitude={lng}
      latitude={lat}
      anchor="center"
      onClick={(e) => {
        e.originalEvent.stopPropagation();
        onSelect();
      }}
    >
      <div
        className={`flex h-5 w-5 items-center justify-center rounded-full border-2 shadow-md ${
          selected ? "ring-2 ring-zinc-900 ring-offset-1" : ""
        }`}
        style={{
          backgroundColor: color,
          borderColor: borderColor ?? "#fff",
        }}
      >
        {label ? (
          <span className="text-[9px] font-bold leading-none text-white">{label}</span>
        ) : null}
      </div>
    </Marker>
  );
}

function routeGeoJson(
  id: string,
  coordinates: [number, number][],
  dashed = false
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id,
        properties: { dashed },
        geometry: {
          type: "LineString",
          coordinates,
        },
      },
    ],
  };
}

export function DispatchMap({
  deliveryRound = 1,
  region,
  showPlan = false,
  includePlan = false,
  refreshKey = 0,
  height = 480,
  mapStyleUrl = getMapStyleUrl(),
  mapAttribution = getMapAttribution(),
}: {
  deliveryRound?: number;
  region?: string;
  showPlan?: boolean;
  includePlan?: boolean;
  refreshKey?: number;
  height?: number | string;
  mapStyleUrl?: string;
  mapAttribution?: string;
}) {
  const mapRef = useRef<MapRef>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<DispatchMapData | null>(null);
  const [selected, setSelected] = useState<SelectedPin | null>(null);
  const [hiddenTrucks, setHiddenTrucks] = useState<Set<number>>(new Set());

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      deliveryRound: String(deliveryRound),
    });
    if (region) params.set("region", region);
    if (includePlan || showPlan) params.set("includePlan", "true");
    return params.toString();
  }, [deliveryRound, region, includePlan, showPlan]);

  const fitToData = useCallback((payload: DispatchMapData) => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const points: [number, number][] = [
      [payload.warehouse.lng, payload.warehouse.lat],
    ];

    for (const order of payload.unassigned) {
      points.push([order.lng, order.lat]);
    }

    for (const truck of payload.trucks) {
      if (hiddenTrucks.has(truck.vehicleId)) continue;
      for (const round of truck.rounds) {
        for (const stop of round.stops) {
          points.push([stop.lng, stop.lat]);
        }
      }
    }

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
  }, [hiddenTrucks]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setSelected(null);

    void (async () => {
      try {
        const res = await fetch(`/api/dispatch/map?${queryString}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Failed to load dispatch map");
        const json = (await res.json()) as DispatchMapData;
        if (cancelled) return;
        setData(json);
        requestAnimationFrame(() => fitToData(json));
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
  }, [queryString, refreshKey, fitToData]);

  const visibleTrucks = useMemo(
    () => data?.trucks.filter((t) => !hiddenTrucks.has(t.vehicleId)) ?? [],
    [data, hiddenTrucks]
  );

  const planRoutes = useMemo(() => {
    if (!showPlan || !data?.plan?.recommendations.length) return [];
    return data.plan.recommendations.map((rec) => {
      const ordered = orderStopsForRoundTrip(rec.orders);
      const truck = data.trucks.find((t) => t.vehicleId === rec.vehicleId);
      const color = truck?.color ?? "#94a3b8";
      const coordinates: [number, number][] = [
        [WAREHOUSE_LOCATION.lng, WAREHOUSE_LOCATION.lat],
        ...ordered.map((s) => [s.lng, s.lat] as [number, number]),
      ];
      return { id: rec.id, color, coordinates, vehicleName: rec.vehicleName };
    });
  }, [showPlan, data]);

  function toggleTruck(vehicleId: number) {
    setHiddenTrucks((prev) => {
      const next = new Set(prev);
      if (next.has(vehicleId)) next.delete(vehicleId);
      else next.add(vehicleId);
      return next;
    });
  }

  if (loading) {
    return (
      <Card className="overflow-hidden">
        <LoadingState title="Loading dispatch map…" />
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

  if (!data) {
    return (
      <Card className="overflow-hidden">
        <EmptyState title="No dispatch map data" />
      </Card>
    );
  }

  const hasPins =
    data.unassigned.length > 0 ||
    visibleTrucks.some((t) => t.rounds.some((r) => r.stops.length > 0));

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-3 py-2">
        <p className="text-xs font-medium text-zinc-700">Trucks</p>
        {data.trucks.map((truck) => {
          const round = truck.rounds[0];
          const hidden = hiddenTrucks.has(truck.vehicleId);
          return (
            <button
              key={truck.vehicleId}
              type="button"
              onClick={() => toggleTruck(truck.vehicleId)}
              className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition ${
                hidden
                  ? "border-zinc-200 bg-zinc-50 text-zinc-400 line-through"
                  : "border-zinc-200 bg-white text-zinc-800"
              }`}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: truck.color }}
              />
              {truck.name}
              {round ? ` · ${round.totalPallets}/${round.maxPallets} plt` : null}
            </button>
          );
        })}
        {data.missingGeo > 0 && (
          <span className="text-xs text-amber-700">
            {data.missingGeo} order(s) without map location
          </span>
        )}
      </div>

      <div className="relative" style={{ height }}>
        {!hasPins ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
            <p className="rounded bg-white px-3 py-1.5 text-sm text-zinc-600 shadow">
              No mappable orders for this round
            </p>
          </div>
        ) : null}
        <Map
          ref={mapRef}
          initialViewState={{
            longitude: KOSOVO_MAP_CENTER.lng,
            latitude: KOSOVO_MAP_CENTER.lat,
            zoom: 10,
          }}
          maxBounds={KOSOVO_MAP_BOUNDS}
          style={{ width: "100%", height: "100%" }}
          mapStyle={mapStyleUrl}
          onClick={() => setSelected(null)}
        >
          <NavigationControl position="top-right" showCompass={false} />
          <WarehouseMarker warehouse={data.warehouse} />

          {visibleTrucks.flatMap((truck) =>
            truck.rounds.flatMap((round) => {
              if (round.routeCoordinates.length < 2) return [];
              return [
                <Source
                  key={`route-${truck.vehicleId}-${round.round}`}
                  id={`route-${truck.vehicleId}-${round.round}`}
                  type="geojson"
                  data={routeGeoJson(
                    `route-${truck.vehicleId}`,
                    round.routeCoordinates
                  )}
                >
                  <Layer
                    id={`route-line-${truck.vehicleId}-${round.round}`}
                    type="line"
                    paint={{
                      "line-color": truck.color,
                      "line-width": 3,
                      "line-opacity": 0.85,
                    }}
                  />
                </Source>,
              ];
            })
          )}

          {showPlan &&
            planRoutes.map((route) =>
              route.coordinates.length >= 2 ? (
                <Source
                  key={`plan-${route.id}`}
                  id={`plan-${route.id}`}
                  type="geojson"
                  data={routeGeoJson(route.id, route.coordinates, true)}
                >
                  <Layer
                    id={`plan-line-${route.id}`}
                    type="line"
                    paint={{
                      "line-color": route.color,
                      "line-width": 2,
                      "line-opacity": 0.55,
                      "line-dasharray": [2, 2],
                    }}
                  />
                </Source>
              ) : null
            )}

          {data.unassigned.map((order) => (
            <OrderPin
              key={`u-${order.id}`}
              lat={order.lat}
              lng={order.lng}
              color={order.priority === "urgent" ? "#ef4444" : "#71717a"}
              selected={
                selected?.kind === "unassigned" && selected.order.id === order.id
              }
              onSelect={() => setSelected({ kind: "unassigned", order })}
            />
          ))}

          {visibleTrucks.flatMap((truck) =>
            truck.rounds.flatMap((round) =>
              round.stops.map((stop) => (
                <OrderPin
                  key={`t-${truck.vehicleId}-${stop.id}`}
                  lat={stop.lat}
                  lng={stop.lng}
                  color="#fff"
                  borderColor={truck.color}
                  label={String(stop.sequence)}
                  selected={
                    selected?.kind === "assigned" &&
                    selected.stop.id === stop.id &&
                    selected.truck.vehicleId === truck.vehicleId
                  }
                  onSelect={() =>
                    setSelected({ kind: "assigned", stop, truck })
                  }
                />
              ))
            )
          )}

          {selected ? (
            <Popup
              longitude={
                selected.kind === "unassigned"
                  ? selected.order.lng
                  : selected.stop.lng
              }
              latitude={
                selected.kind === "unassigned"
                  ? selected.order.lat
                  : selected.stop.lat
              }
              anchor="bottom"
              closeOnClick={false}
              onClose={() => setSelected(null)}
              maxWidth="260px"
            >
              <div className="space-y-1 p-1 text-sm">
                {selected.kind === "unassigned" ? (
                  <>
                    <p className="font-semibold text-zinc-900">
                      {selected.order.invoiceNumber}
                    </p>
                    <p className="text-zinc-600">{selected.order.customerName}</p>
                    <p className="text-xs text-zinc-500">{selected.order.location}</p>
                    <p className="text-xs text-zinc-500">
                      {selected.order.totalPallets} plt · {selected.order.region}
                    </p>
                    {selected.order.priority === "urgent" && (
                      <Badge tone="red">Urgent</Badge>
                    )}
                    <p className="text-xs text-zinc-400">Unassigned</p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold text-zinc-900">
                      {selected.stop.invoiceNumber}
                    </p>
                    <p className="text-zinc-600">{selected.stop.customerName}</p>
                    <p className="text-xs text-zinc-500">{selected.stop.location}</p>
                    <p className="text-xs text-zinc-500">
                      Stop #{selected.stop.sequence} ·{" "}
                      <span style={{ color: selected.truck.color }}>
                        {selected.truck.name}
                      </span>
                    </p>
                  </>
                )}
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

export type { DispatchMapData };
