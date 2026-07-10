"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Badge,
  Card,
  PageSection,
  SegmentedControl,
  Select,
  StatCard,
} from "@/components/ui";
import type { KosovoOrderMapFilters } from "@/components/map/KosovoOrderMap";
import type { WorkDayFilter } from "@/lib/delivery-schedule";
import { KOSOVO_MUNICIPALITIES } from "@/lib/locations";

const KosovoOrderMap = dynamic(
  () =>
    import("@/components/map/KosovoOrderMap").then((m) => ({
      default: m.KosovoOrderMap,
    })),
  {
    ssr: false,
    loading: () => (
      <Card className="flex h-[520px] items-center justify-center">
        <p className="animate-pulse text-sm text-zinc-500">Loading map…</p>
      </Card>
    ),
  }
);

export default function MapPage() {
  const [region, setRegion] = useState("");
  const [workDay, setWorkDay] = useState<WorkDayFilter>("today");
  const [unassigned, setUnassigned] = useState(false);
  const [stats, setStats] = useState({
    orderCount: 0,
    streetPins: 0,
    cityPins: 0,
  });

  const filters: KosovoOrderMapFilters = useMemo(
    () => ({
      region: region || undefined,
      unassigned: unassigned || undefined,
      workDay,
    }),
    [region, unassigned, workDay]
  );

  const handleLoaded = useCallback(
    (next: { orderCount: number; streetPins: number; cityPins: number }) => {
      setStats(next);
    },
    []
  );

  return (
    <AppShell
      title="Delivery map"
      description="Active orders across Kosovo — street-level and city clusters"
    >
      <PageSection title="Filters">
        <Card className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Select
              label="Region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              <option value="">All municipalities</option>
              {KOSOVO_MUNICIPALITIES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
            <div>
              <span className="mb-1 block text-xs font-medium text-zinc-600">
                Work day
              </span>
              <SegmentedControl
                value={workDay}
                onChange={setWorkDay}
                size="sm"
                options={[
                  { value: "today", label: "Today" },
                  { value: "yesterday", label: "Yesterday" },
                  { value: "overdue", label: "Overdue" },
                  { value: "all", label: "All" },
                ]}
              />
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-zinc-600">
                Assignment
              </span>
              <button
                type="button"
                onClick={() => setUnassigned((v) => !v)}
                className={`rounded border px-3 py-2 text-sm transition ${
                  unassigned
                    ? "border-blue-300 bg-blue-50 text-blue-800"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {unassigned ? "Unassigned only" : "All orders"}
                {unassigned ? <Badge tone="blue"> on</Badge> : null}
              </button>
            </div>
          </div>
        </Card>
      </PageSection>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="Orders" value={stats.orderCount} />
        <StatCard label="Street pins" value={stats.streetPins} />
        <StatCard label="City pins" value={stats.cityPins} />
      </div>

      <KosovoOrderMap filters={filters} onLoaded={handleLoaded} />
    </AppShell>
  );
}
