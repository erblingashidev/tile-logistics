"use client";

import { PortalCard, PortalChip, PortalShell } from "@/components/portal/PortalShell";
import { Alert } from "@/components/ui";
import { OutdoorPutawayForm } from "@/components/wms/OutdoorPutawayForm";
import { usePortalDepot } from "@/hooks/usePortalDepot";
import { employeeShowDepotNav } from "@/lib/portal-depot-nav";
import { sq } from "@/lib/i18n/sq";

export default function PortalMappingPage() {
  const depot = usePortalDepot();
  const sectorChoices =
    depot.warehouseZones.length > 0
      ? depot.warehouseZones
      : [...new Set(depot.outdoorLocations.map((l) => l.zone).filter(Boolean))] as string[];

  return (
    <PortalShell
      title={sq.mappingTitle}
      subtitle={depot.employeeName}
      activeNav="mapping"
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
        <p className="text-sm text-zinc-600">{sq.mappingHint}</p>

        {sectorChoices.length > 1 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-zinc-500">{sq.mappingPickSector}</p>
            <div className="flex flex-wrap gap-2">
              <PortalChip
                selected={depot.mappingZone === null}
                onClick={() => depot.setMappingZone(null)}
              >
                {sq.mappingAllSectors}
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
            {sq.mappingYourSector}: <strong>{depot.mappingZone}</strong>
          </p>
        ) : null}

        <OutdoorPutawayForm
          locations={depot.mappingLocations}
          submitLabel={sq.putawaySave}
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
            if (!res.ok) throw new Error(data.error ?? sq.errors.generic);
            depot.setSuccess(sq.putawaySuccess);
            setTimeout(() => depot.setSuccess(""), 3000);
          }}
        />
      </PortalCard>
    </PortalShell>
  );
}
