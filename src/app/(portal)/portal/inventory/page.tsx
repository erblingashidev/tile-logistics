"use client";

import { useState } from "react";
import { PortalCard, PortalShell } from "@/components/portal/PortalShell";
import { Alert, Badge, Button, Input, Select } from "@/components/ui";
import { usePortalDepot } from "@/hooks/usePortalDepot";
import { formatLocationOption } from "@/lib/warehouse-location-code";
import { employeeShowDepotNav } from "@/lib/portal-depot-nav";
import { sq } from "@/lib/i18n/sq";

export default function PortalInventoryPage() {
  const depot = usePortalDepot();
  const [form, setForm] = useState({ ean: "", quantityM2: "", locationId: "" });

  async function submitLine() {
    if (!depot.activeSector) return;
    depot.setError("");
    depot.setSuccess("");
    const res = await fetch("/api/wms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "inventory",
        ean: form.ean.trim(),
        quantityM2: form.quantityM2 ? Number(form.quantityM2) : undefined,
        locationId: form.locationId ? Number(form.locationId) : undefined,
        zone: depot.activeSector.zone,
        sectorCountId: depot.activeSector.id,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      depot.setError(data.error ?? sq.errors.generic);
      return;
    }
    depot.setSuccess(sq.inventoryLineSaved);
    setForm({ ean: "", quantityM2: "", locationId: form.locationId });
    setTimeout(() => depot.setSuccess(""), 3000);
    await depot.load();
  }

  return (
    <PortalShell
      title={sq.inventoryTitle}
      subtitle={depot.employeeName}
      activeNav="inventory"
      showOrders
      showDepotNav={employeeShowDepotNav(depot.roles)}
      showReports={depot.showReports}
      onLogout={depot.logout}
      onRefresh={depot.refreshNow}
      refreshing={depot.refreshing}
    >
      {depot.error && <Alert tone="error">{depot.error}</Alert>}
      {depot.success && <Alert tone="info">{depot.success}</Alert>}

      <PortalCard className="space-y-4">
        {!depot.openSession ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-100">
            {sq.noOpenSession}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-zinc-600">{sq.sessionOpen}</p>
              <Badge tone="green">{depot.openSession.name}</Badge>
            </div>

            {!depot.activeSector ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-zinc-900">
                  {sq.inventoryPickZone}
                </p>
                <p className="text-xs text-zinc-500">{sq.inventoryPickZoneHint}</p>
                <div className="grid gap-2">
                  {depot.zones.map((zone) => (
                    <button
                      key={zone.zone}
                      type="button"
                      onClick={() => void depot.startSector(zone.zone)}
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
                      {depot.activeSector.zone}
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => void depot.closeSector()}>
                    {sq.inventoryCloseSector}
                  </Button>
                </div>
                <p className="text-xs text-zinc-500">{sq.inventoryCloseSectorHint}</p>
              </div>
            )}
          </>
        )}
      </PortalCard>

      {depot.activeSector && (
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
            {depot.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {formatLocationOption(l.code, l.zone)}
              </option>
            ))}
          </Select>
          <Button
            className="w-full py-4 text-base font-semibold"
            disabled={!form.ean || !form.locationId || !form.quantityM2}
            onClick={() => void submitLine()}
          >
            {sq.save}
          </Button>
        </PortalCard>
      )}
    </PortalShell>
  );
}
