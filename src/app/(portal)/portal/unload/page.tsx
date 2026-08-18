"use client";

import { useState } from "react";
import { PortalCard, PortalShell } from "@/components/portal/PortalShell";
import { Alert, Button, Input } from "@/components/ui";
import { usePortalDepot } from "@/hooks/usePortalDepot";
import { employeeShowDepotNav } from "@/lib/portal-depot-nav";
import { useFeatureFlags } from "@/components/features/FeatureFlagsProvider";
import { sq } from "@/lib/i18n/sq";

export default function PortalUnloadPage() {
  const depot = usePortalDepot();
  const { warehouseWms } = useFeatureFlags();
  const [ean, setEan] = useState("");
  const [quantityM2, setQuantityM2] = useState("");

  async function submit() {
    depot.setError("");
    depot.setSuccess("");
    const res = await fetch("/api/wms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "receive",
        ean: ean.trim(),
        quantityM2: quantityM2 ? Number(quantityM2) : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      depot.setError(data.error ?? sq.errors.generic);
      return;
    }
    depot.setSuccess(
      `${sq.receiveSuccess}${
        data.quantityM2 != null ? ` · ${data.quantityM2} m²` : ""
      }`
    );
    setEan("");
    setQuantityM2("");
    setTimeout(() => depot.setSuccess(""), 3000);
  }

  return (
    <PortalShell
      title={sq.unloadTitle}
      subtitle={depot.employeeName}
      activeNav="unload"
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
        <p className="text-sm text-zinc-600">{sq.unloadHint}</p>
        <Input
          placeholder={sq.ean}
          value={ean}
          onChange={(e) => setEan(e.target.value)}
          className="rounded-xl py-3 text-base"
        />
        <Input
          type="number"
          step="0.01"
          placeholder={sq.quantityM2}
          value={quantityM2}
          onChange={(e) => setQuantityM2(e.target.value)}
          className="rounded-xl py-3 text-base"
        />
        <Button
          className="w-full py-4 text-base font-semibold"
          disabled={!ean || !quantityM2}
          onClick={() => void submit()}
        >
          {sq.unloadSave}
        </Button>
      </PortalCard>
    </PortalShell>
  );
}
