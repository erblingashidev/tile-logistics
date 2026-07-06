"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PortalCard,
  PortalShell,
  PortalTabs,
} from "@/components/portal/PortalShell";
import { Badge, Button, Input, Select, Alert } from "@/components/ui";
import { sq } from "@/lib/i18n/sq";
import type { EmployeeRole } from "@/lib/constants";
import { WAREHOUSE_REPORT_ROLES } from "@/lib/employee-categories";

interface Location {
  id: number;
  code: string;
  label: string | null;
  zone: string | null;
}

interface ZoneStatus {
  zone: string;
  status: "pending" | "counting" | "closed";
  sectorCountId: number | null;
  lineCount: number;
  totalM2: number;
}

export default function PortalWmsPage() {
  const router = useRouter();
  const [locations, setLocations] = useState<Location[]>([]);
  const [zones, setZones] = useState<ZoneStatus[]>([]);
  const [employeeName, setEmployeeName] = useState<string>();
  const [roles, setRoles] = useState<EmployeeRole[]>([]);
  const [openSession, setOpenSession] = useState<{ id: number; name: string } | null>(
    null
  );
  const [tab, setTab] = useState<"receive" | "inventory">("receive");
  const [activeSector, setActiveSector] = useState<{
    id: number;
    zone: string;
  } | null>(null);
  const [form, setForm] = useState({ ean: "", quantityM2: "", locationId: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
    setLocations(data.locations ?? []);
    setOpenSession(data.openSession ?? null);
    setZones(data.zones ?? []);
    setEmployeeName(me?.user?.name);
    setRoles(me?.user?.roles ?? []);

    const counting = (data.zones as ZoneStatus[] | undefined)?.find(
      (z) => z.status === "counting" && z.sectorCountId
    );
    if (counting?.sectorCountId) {
      setActiveSector({ id: counting.sectorCountId, zone: counting.zone });
      const locRes = await fetch(
        `/api/wms?zone=${encodeURIComponent(counting.zone)}`
      );
      if (locRes.ok) {
        const locData = await locRes.json();
        setLocations(locData.locations ?? []);
      }
    } else {
      setActiveSector(null);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

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
    const locRes = await fetch(`/api/wms?zone=${encodeURIComponent(zone)}`);
    if (locRes.ok) {
      const locData = await locRes.json();
      setLocations(locData.locations ?? []);
    }
    setForm({ ean: "", quantityM2: "", locationId: "" });
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
    setForm({ ean: "", quantityM2: "", locationId: "" });
    setTimeout(() => setSuccess(""), 3000);
    await load();
  }

  async function submit(action: "receive" | "inventory") {
    setError("");
    setSuccess("");
    const res = await fetch("/api/wms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        ean: form.ean.trim(),
        quantityM2: Number(form.quantityM2),
        locationId: form.locationId ? Number(form.locationId) : undefined,
        zone: activeSector?.zone,
        sectorCountId: activeSector?.id,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? sq.errors.generic);
      return;
    }
    setSuccess(
      action === "receive" ? sq.receiveSuccess : sq.inventoryLineSaved
    );
    setForm({ ean: "", quantityM2: "", locationId: form.locationId });
    setTimeout(() => setSuccess(""), 3000);
    if (action === "inventory") await load();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <PortalShell
      title={sq.wmsTitle}
      subtitle={employeeName}
      activeNav="wms"
      showOrders
      showWms
      showReports={roles.some((r) => WAREHOUSE_REPORT_ROLES.includes(r))}
      onLogout={logout}
    >
      {error && <Alert tone="error">{error}</Alert>}
      {success && <Alert tone="info">{success}</Alert>}

      <PortalTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "receive", label: sq.wmsReceive },
          { id: "inventory", label: sq.wmsInventory, disabled: !openSession },
        ]}
      />

      {tab === "inventory" && (
        <PortalCard className="space-y-4">
          {!openSession ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-100">
              {sq.noOpenSession}
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-zinc-600">{sq.sessionOpen}</p>
                <Badge tone="green">{openSession.name}</Badge>
              </div>

              {!activeSector ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-zinc-900">
                    {sq.inventoryPickZone}
                  </p>
                  <p className="text-xs text-zinc-500">{sq.inventoryPickZoneHint}</p>
                  <div className="grid gap-2">
                    {zones.map((zone) => (
                      <button
                        key={zone.zone}
                        type="button"
                        onClick={() => startSector(zone.zone)}
                        className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left hover:border-zinc-400"
                      >
                        <span className="font-medium text-zinc-900">{zone.zone}</span>
                        <Badge
                          tone={
                            zone.status === "closed"
                              ? "green"
                              : zone.status === "counting"
                                ? "amber"
                                : "slate"
                          }
                        >
                          {zone.status === "closed"
                            ? sq.inventoryZoneClosed
                            : zone.status === "counting"
                              ? sq.inventoryZoneCounting
                              : sq.inventoryZonePending}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3 rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-100">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-zinc-400">
                        {sq.inventoryActiveZone}
                      </p>
                      <p className="text-lg font-semibold text-zinc-900">
                        {activeSector.zone}
                      </p>
                    </div>
                    <Button variant="secondary" onClick={closeSector}>
                      {sq.inventoryCloseSector}
                    </Button>
                  </div>
                  <p className="text-xs text-zinc-500">{sq.inventoryCloseSectorHint}</p>
                </div>
              )}
            </>
          )}
        </PortalCard>
      )}

      {(tab === "receive" || (tab === "inventory" && activeSector)) && (
        <PortalCard className="space-y-4">
          <p className="text-sm text-zinc-500">{sq.scanHint}</p>
          <Input
            placeholder={sq.ean}
            value={form.ean}
            onChange={(e) => setForm({ ...form, ean: e.target.value })}
            className="rounded-xl py-3 text-base"
          />
          <Input
            type="number"
            step="0.01"
            placeholder={sq.quantityM2}
            value={form.quantityM2}
            onChange={(e) => setForm({ ...form, quantityM2: e.target.value })}
            className="rounded-xl py-3 text-base"
          />
          <Select
            label={sq.location}
            value={form.locationId}
            onChange={(e) => setForm({ ...form, locationId: e.target.value })}
          >
            <option value="">{sq.selectLocation}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} {l.label ? `— ${l.label}` : ""}
              </option>
            ))}
          </Select>
          <Button
            className="w-full py-4 text-base font-semibold"
            disabled={
              !form.ean ||
              !form.quantityM2 ||
              !form.locationId ||
              (tab === "inventory" && !activeSector)
            }
            onClick={() => submit(tab === "receive" ? "receive" : "inventory")}
          >
            {sq.save}
          </Button>
        </PortalCard>
      )}
    </PortalShell>
  );
}
