"use client";

import { useEffect, useState } from "react";
import { Input, Select } from "@/components/ui";
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
  }, [detailQuery]);

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
    onChange({
      region: o.region || region,
      locationDetail: o.name,
      id: o.id,
      city: o.city,
      lat: o.lat,
      lng: o.lng,
    });
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
        hint="Street or village"
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
    </div>
  );
}
