"use client";

import { useEffect, useState } from "react";
import { Button, Select } from "@/components/ui";
import { ORDER_STATUSES } from "@/lib/constants";
import { deliveryRoundSelectOptions } from "@/lib/delivery-rounds";

interface VehicleOption {
  id: number;
  name: string;
  plateNumber: string;
}

interface PickerOption {
  id: number;
  name: string;
}

interface ManualOrderStatusSelectProps {
  orderId: number;
  currentStatus: string;
  vehicles?: VehicleOption[];
  pickers?: PickerOption[];
  currentVehicleId?: number | null;
  currentDeliveryRound?: number;
  currentPickerId?: number | null;
  onUpdated: () => void;
  onError: (message: string) => void;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  assigned: "Assigned / on truck",
  in_transit: "In transit",
  partially_delivered: "Partially delivered",
  delivered: "Done — delivered",
  cancelled: "Cancelled",
};

export function ManualOrderStatusSelect({
  orderId,
  currentStatus,
  vehicles = [],
  pickers = [],
  currentVehicleId,
  currentDeliveryRound = 1,
  currentPickerId,
  onUpdated,
  onError,
}: ManualOrderStatusSelectProps) {
  const [status, setStatus] = useState(currentStatus);
  const [vehicleId, setVehicleId] = useState(
    currentVehicleId ? String(currentVehicleId) : ""
  );
  const [deliveryRound, setDeliveryRound] = useState(
    String(currentDeliveryRound || 1)
  );
  const [pickerId, setPickerId] = useState(
    currentPickerId ? String(currentPickerId) : ""
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStatus(currentStatus);
  }, [currentStatus]);

  useEffect(() => {
    setVehicleId(currentVehicleId ? String(currentVehicleId) : "");
    setDeliveryRound(String(currentDeliveryRound || 1));
    setPickerId(currentPickerId ? String(currentPickerId) : "");
  }, [currentVehicleId, currentDeliveryRound, currentPickerId]);

  const showAttribution = vehicles.length > 0 || pickers.length > 0;
  const hasAttributionSelection = Boolean(vehicleId || pickerId);

  async function save() {
    setBusy(true);
    onError("");

    const payload: Record<string, unknown> = { status };
    if (vehicleId) {
      payload.vehicleId = Number(vehicleId);
      payload.deliveryRound = Number(deliveryRound) || 1;
    }
    if (pickerId) payload.pickerId = Number(pickerId);

    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      onError(data.error ?? "Could not update status");
      return;
    }
    onUpdated();
  }

  const unchanged =
    status === currentStatus &&
    vehicleId === (currentVehicleId ? String(currentVehicleId) : "") &&
    deliveryRound === String(currentDeliveryRound || 1) &&
    pickerId === (currentPickerId ? String(currentPickerId) : "");

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-zinc-300 bg-white p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1">
          <Select
            label="Manual status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s] ?? s}
              </option>
            ))}
          </Select>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || unchanged}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Update status"}
        </Button>
      </div>

      {showAttribution && (
        <div className="grid gap-3 border-t border-zinc-100 pt-3 sm:grid-cols-3">
          {vehicles.length > 0 && (
            <>
              <Select
                label="Transport truck"
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
              >
                <option value="">— Not set —</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.plateNumber})
                  </option>
                ))}
              </Select>
              <Select
                label="Trip / round"
                value={deliveryRound}
                onChange={(e) => setDeliveryRound(e.target.value)}
                disabled={!vehicleId}
              >
                {deliveryRoundSelectOptions().map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </>
          )}
          {pickers.length > 0 && (
            <Select
              label="Prepared by (picker)"
              value={pickerId}
              onChange={(e) => setPickerId(e.target.value)}
            >
              <option value="">— Not set —</option>
              {pickers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          )}
        </div>
      )}

      {showAttribution && hasAttributionSelection && (
        <p className="text-[11px] leading-snug text-zinc-500">
          Truck and preparer are saved for reporting, but step times (assigned,
          prepared, loaded, etc.) are left blank when set here. Use Assign staff
          and the workflow steps below to record times as you go.
        </p>
      )}
    </div>
  );
}
