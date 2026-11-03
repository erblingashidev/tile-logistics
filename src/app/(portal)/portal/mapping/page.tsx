"use client";

import { PortalCard, PortalChip, PortalShell } from "@/components/portal/PortalShell";
import { Alert } from "@/components/ui";
import { OutdoorPutawayForm } from "@/components/wms/OutdoorPutawayForm";
import { usePortalDepot } from "@/hooks/usePortalDepot";
import { employeeShowDepotNav } from "@/lib/portal-depot-nav";
import { useFeatureFlags } from "@/components/features/FeatureFlagsProvider";
import { usePortalLabels } from "@/lib/i18n/portal-labels";

export default function PortalMappingPage() {
  const { p } = usePortalLabels();
  const depot = usePortalDepot();
  const { warehouseWms } = useFeatureFlags();
  const sectorChoices =
    depot.warehouseZones.length > 0
      ? depot.warehouseZones
      : [...new Set(depot.outdoorLocations.map((l) => l.zone).filter(Boolean))] as string[];

  return (
    <PortalShell
      title={p.mappingTitle}
      subtitle={depot.employeeName}
      activeNav="mapping"
      showOrders
      showDepotNav={employeeShowDepotNav(depot.roles, warehouseWms)}
      showReports={depot.showReports}
      onLogout={depot.logout}
      onRefresh={depot.refreshNow}
      refreshing={depot.refreshing}
    >
      {depot.error && <Alert tone="error">{depot.error}</Alert>}
      {depot.success && <Alert tone="info">{depot.success}</Alert>}

      <PortalCard className="space-y-4">
        <p className="text-sm text-zinc-600">{p.mappingHint}</p>

        {sectorChoices.length > 1 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-zinc-500">{p.mappingPickSector}</p>
            <div className="flex flex-wrap gap-2">
              <PortalChip
                selected={depot.mappingZone === null}
                onClick={() => depot.setMappingZone(null)}
              >
                {p.mappingAllSectors}
              </PortalChip>
              {sectorChoices.map((zone) => (
                <PortalChip
                  key={zone}
                  selected={depot.mappingZone === zone}
                  onClick={() => depot.setMappingZone(zone)}
                >
                  {zone}
                </PortalChip>
              ))}
            </div>
          </div>
        ) : depot.mappingZone ? (
          <p className="text-xs text-zinc-500">
            {p.mappingYourSector}: <strong>{depot.mappingZone}</strong>
          </p>
        ) : null}

        <OutdoorPutawayForm
          locations={depot.mappingLocations}
          submitLabel={p.putawaySave}
          onSubmit={async ({ productId, locationId, quantityM2 }) => {
            const res = await fetch("/api/wms", {
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
            if (!res.ok) throw new Error(data.error ?? p.errors.generic);
            depot.setSuccess(p.putawaySuccess);
            setTimeout(() => depot.setSuccess(""), 3000);
          }}
        />
      </PortalCard>
    </PortalShell>
  );
}
