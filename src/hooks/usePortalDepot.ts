"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EmployeeRole } from "@/lib/constants";
import { WAREHOUSE_REPORT_ROLES } from "@/lib/employee-categories";
import { sq } from "@/lib/i18n/sq";

export interface PortalLocation {
  id: number;
  code: string;
  label: string | null;
  zone: string | null;
}

export interface PortalZoneStatus {
  zone: string;
  status: "pending" | "counting" | "closed";
  sectorCountId: number | null;
  lineCount: number;
  totalM2: number;
}

export function usePortalDepot() {
  const router = useRouter();
  const [locations, setLocations] = useState<PortalLocation[]>([]);
  const [allLocations, setAllLocations] = useState<PortalLocation[]>([]);
  const [zones, setZones] = useState<PortalZoneStatus[]>([]);
  const [warehouseZones, setWarehouseZones] = useState<string[]>([]);
  const [employeeName, setEmployeeName] = useState<string>();
  const [roles, setRoles] = useState<EmployeeRole[]>([]);
  const [openSession, setOpenSession] = useState<{ id: number; name: string } | null>(
    null
  );
  const [activeSector, setActiveSector] = useState<{
    id: number;
    zone: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [mappingZone, setMappingZone] = useState<string | null>(null);

  const outdoorLocations = useMemo(
    () =>
      allLocations.filter(
        (l) => l.code !== "STAGING" && !l.code.startsWith("PRODATA-")
      ),
    [allLocations]
  );

  const mappingLocations = useMemo(() => {
    if (!mappingZone) return outdoorLocations;
    return outdoorLocations.filter((l) => l.zone === mappingZone);
  }, [outdoorLocations, mappingZone]);

  const showReports = roles.some((r) => WAREHOUSE_REPORT_ROLES.includes(r));

  const loadZoneLocations = useCallback(async (zone: string) => {
    const locRes = await fetch(`/api/wms?zone=${encodeURIComponent(zone)}`);
    if (locRes.ok) {
      const locData = await locRes.json();
      setLocations(locData.locations ?? []);
    }
  }, []);

  const load = useCallback(async () => {
    const [wmsRes, meRes] = await Promise.all([
      fetch("/api/wms"),
      fetch("/api/auth/me"),
    ]);
    if (wmsRes.status === 401 || meRes.status === 401) {
      router.push("/login");
      return;
    }
    if (wmsRes.status === 403) {
      setError(sq.noWmsAccess);
      return;
    }
    const data = await wmsRes.json();
    const me = meRes.ok ? await meRes.json() : null;
    const locs = data.locations ?? [];
    setAllLocations(locs);
    setLocations(locs);
    setOpenSession(data.openSession ?? null);
    setZones(data.zones ?? []);
    setWarehouseZones(data.warehouseZones ?? []);
    setEmployeeName(me?.user?.name);
    setRoles(me?.user?.roles ?? []);

    const assigned: string[] = data.warehouseZones ?? [];
    setMappingZone((prev) => {
      if (assigned.length === 1) return assigned[0]!;
      if (prev && assigned.includes(prev)) return prev;
      return assigned.length > 1 ? null : prev;
    });

    const counting = (data.zones as PortalZoneStatus[] | undefined)?.find(
      (z) => z.status === "counting" && z.sectorCountId
    );
    if (counting?.sectorCountId) {
      setActiveSector({ id: counting.sectorCountId, zone: counting.zone });
      await loadZoneLocations(counting.zone);
    } else {
      setActiveSector(null);
    }
  }, [router, loadZoneLocations]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refreshNow() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  async function startSector(zone: string) {
    setError("");
    const res = await fetch("/api/wms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start_sector", zone }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? sq.errors.generic);
      return;
    }
    setActiveSector({ id: data.sector.id, zone: data.sector.zone });
    await loadZoneLocations(zone);
    await load();
  }

  async function closeSector() {
    if (!activeSector) return;
    setError("");
    const res = await fetch("/api/wms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "close_sector",
        sectorCountId: activeSector.id,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? sq.errors.generic);
      return;
    }
    setSuccess(sq.inventorySectorClosed);
    setActiveSector(null);
    setTimeout(() => setSuccess(""), 3000);
    await load();
  }

  return {
    locations,
    allLocations,
    outdoorLocations,
    mappingLocations,
    zones,
    warehouseZones,
    mappingZone,
    setMappingZone,
    employeeName,
    roles,
    openSession,
    activeSector,
    error,
    success,
    setError,
    setSuccess,
    refreshing,
    refreshNow,
    logout,
    showReports,
    startSector,
    closeSector,
    load,
  };
}
