"use client";

import { useEffect, useState } from "react";
import { Input, Select, Button } from "@/components/ui";
import { LocationMapPicker } from "@/components/map/LocationMapPicker";
import { KOSOVO_MUNICIPALITIES } from "@/lib/locations";

export interface LocationValue {
  region: string;
  locationDetail: string;
  id?: string;
  city?: string;
  lat?: number;
  lng?: number;
}

export function LocationPicker({
  region,
  locationDetail,
  locationId,
  onChange,
}: {
  region: string;
  locationDetail: string;
  locationId?: string;
  onChange: (loc: LocationValue) => void;
}) {
  const [detailQuery, setDetailQuery] = useState(locationDetail);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [mapCoords, setMapCoords] = useState<{ lat?: number; lng?: number }>(
    {}
  );
  const [options, setOptions] = useState<
    Array<{
      id: string;
      name: string;
      city: string;
      region: string;
      lat: number;
      lng: number;
    }>
  >([]);

  useEffect(() => {
    setDetailQuery(locationDetail);
  }, [locationDetail]);

  useEffect(() => {
    if (detailQuery.trim().length < 2) {
      setOptions([]);
      return;
    }
    const t = setTimeout(async () => {
      const params = new URLSearchParams();
      params.set("q", detailQuery);
      params.set("live", "true");
      params.set("recent", "true");
      if (region) params.set("region", region);
      const res = await fetch(`/api/locations?${params}`);
      const data = await res.json();
      setOptions(
        (data.locations ?? []).map(
          (l: {
            id: string;
            name: string;
            city: string;
            region: string;
            lat: number;
            lng: number;
          }) => ({
            id: l.id,
            name: l.name,
            city: l.city,
            region: l.region,
            lat: l.lat,
            lng: l.lng,
          })
        )
      );
    }, 250);
    return () => clearTimeout(t);
  }, [detailQuery, region]);

  function pickOption(
    o: {
      id: string;
      name: string;
      city: string;
      region: string;
      lat: number;
      lng: number;
    }
  ) {
    setDetailQuery(o.name);
    setMapCoords({ lat: o.lat, lng: o.lng });
    onChange({
      region: o.region || region,
      locationDetail: o.name,
      id: o.id,
      city: o.city,
      lat: o.lat,
      lng: o.lng,
    });
  }

  function handleMapPick(loc: LocationValue) {
    setDetailQuery(loc.locationDetail);
    setMapCoords({ lat: loc.lat, lng: loc.lng });
    onChange(loc);
  }

  return (
    <div className="space-y-3 sm:col-span-2">
      <Select
        label="Region (municipality)"
        required
        value={region}
        onChange={(e) =>
          onChange({
            region: e.target.value,
            locationDetail: detailQuery,
            id: locationId,
            lat: mapCoords.lat,
            lng: mapCoords.lng,
          })
        }
      >
        <option value="">Select region…</option>
        {KOSOVO_MUNICIPALITIES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </Select>

      <Input
        label="Delivery details"
        list="location-detail-options"
        value={detailQuery}
        onChange={(e) => {
          setDetailQuery(e.target.value);
          onChange({
            region,
            locationDetail: e.target.value,
            id: undefined,
            city: undefined,
            lat: undefined,
            lng: undefined,
          });
          setMapCoords({});
        }}
        onBlur={() => {
          const match = options.find(
            (o) => o.name.toLowerCase() === detailQuery.trim().toLowerCase()
          );
          if (match) pickOption(match);
        }}
      />
      <datalist id="location-detail-options">
        {options.map((o) => (
          <option key={o.id ?? o.name} value={o.name}>
            {o.region}
          </option>
        ))}
      </datalist>

      <Button
        type="button"
        variant={showMapPicker ? "primary" : "secondary"}
        size="sm"
        onClick={() => setShowMapPicker((open) => !open)}
      >
        {showMapPicker ? "Hide map" : "Pick on map"}
      </Button>

      {showMapPicker ? (
        <LocationMapPicker
          region={region}
          lat={mapCoords.lat}
          lng={mapCoords.lng}
          onChange={handleMapPick}
        />
      ) : null}
    </div>
  );
}
