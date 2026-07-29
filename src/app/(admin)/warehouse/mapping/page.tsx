"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui";
import { OutdoorPutawayForm } from "@/components/wms/OutdoorPutawayForm";
import { WarehouseNav } from "@/components/warehouse/WarehouseNav";
import { formatM2 } from "@/lib/calculations";

interface Location {
  id: number;
  code: string;
  label: string | null;
  zone: string | null;
}

export default function WarehouseMappingPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/warehouse/stock?view=locations");
    if (res.ok) {
      setLocations(await res.json());
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const outdoorLocations = useMemo(
    () =>
      locations.filter(
        (l) => l.code !== "STAGING" && !l.code.startsWith("PRODATA-")
      ),
    [locations]
  );

  return (
    <AppShell
      title="Mapping (put-away)"
      description="Place stock from STAGING onto outdoor rows"
    >
      <WarehouseNav />

      {msg ? (
        <p className="mb-4 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          {msg}
        </p>
      ) : null}

      <Card className="max-w-xl p-4">
        <p className="mb-4 text-sm text-zinc-600">
          Search the product, pick the row where it sits (e.g.{" "}
          <code className="rounded bg-zinc-100 px-1">D3-K1M</code> = Depo 3,
          Kolona 1 Majtas), and enter m² placed there.
        </p>
        <OutdoorPutawayForm
          apiBase="/api/warehouse/stock"
          locations={outdoorLocations}
          submitLabel="Save putaway"
          onSubmit={async ({ productId, locationId, quantityM2 }) => {
            const res = await fetch("/api/warehouse/stock", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "putaway",
                productId,
                locationId,
                quantityM2,
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Putaway failed");
            setMsg(
              `Putaway ${formatM2(data.quantityM2)} m² at ${data.locationCode ?? "row"}`
            );
            await load();
          }}
        />
        <p className="mt-4 text-xs text-zinc-500">
          Need a new row?{" "}
          <Link href="/warehouse/locations" className="font-medium underline">
            Add rows & sectors
          </Link>
        </p>
      </Card>
    </AppShell>
  );
}
