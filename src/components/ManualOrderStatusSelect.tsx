"use client";

import { useEffect, useState } from "react";
import { Button, Select } from "@/components/ui";
import { MANUAL_ORDER_STATUSES, type ManualOrderStatus } from "@/lib/constants";
import { pastWorkDateCompletionNote } from "@/lib/delivery-schedule";
import { manualStatusFromOrder } from "@/lib/manual-order-status-display";

interface VehicleOption {
  id: number;
  name: string;
  plateNumber: string;
}

interface PickerOption {
  id: number;
  name: string;
}

interface LinkedOrder {
  id: number;
  invoiceNumber: string;
}

interface ManualOrderStatusSelectProps {
  orderId: number;
  currentStatus: string;
  prepStatus?: "pending" | "prepared";
  orderDate?: string;
  requestedDeliveryDate?: string | null;
  vehicles?: VehicleOption[];
  pickers?: PickerOption[];
  currentVehicleId?: number | null;
  currentPickerId?: number | null;
  linkedOrders?: LinkedOrder[];
  onUpdated: () => void;
  onError: (message: string) => void;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  prepared: "Prepared",
  assigned: "Assigned / on truck",
  in_transit: "In transit",
  partially_delivered: "Partially delivered",
  delivered: "Done — delivered",
  cancelled: "Cancelled",
};

export function ManualOrderStatusSelect({
  orderId,
  currentStatus,
  prepStatus,
  orderDate,
  requestedDeliveryDate,
  vehicles = [],
  pickers = [],
  currentVehicleId,
  currentPickerId,
  linkedOrders = [],
  onUpdated,
  onError,
}: ManualOrderStatusSelectProps) {
  const resolvedStatus = manualStatusFromOrder({ status: currentStatus, prepStatus });
  const [status, setStatus] = useState(resolvedStatus);
  const [vehicleId, setVehicleId] = useState(
    currentVehicleId ? String(currentVehicleId) : ""
  );
  const [pickerId, setPickerId] = useState(
    currentPickerId ? String(currentPickerId) : ""
  );
  const [applyToLinked, setApplyToLinked] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStatus(manualStatusFromOrder({ status: currentStatus, prepStatus }));
  }, [currentStatus, prepStatus]);

  useEffect(() => {
    setVehicleId(currentVehicleId ? String(currentVehicleId) : "");
    setPickerId(currentPickerId ? String(currentPickerId) : "");
  }, [currentVehicleId, currentPickerId]);

  const partners = linkedOrders.filter((link) => link.id !== orderId);
  const isCurrentlyDelivered = resolvedStatus === "delivered";
  const isRevertFromDelivered = isCurrentlyDelivered && status !== "delivered";
  const showLinkedOption =
    partners.length > 0 && (status === "delivered" || isRevertFromDelivered);
  const showAttribution = vehicles.length > 0 || pickers.length > 0;
  const linkedUpdateCount =
    showLinkedOption && applyToLinked ? partners.length + 1 : 1;

  async function save() {
    setBusy(true);
    onError("");

    const payload: Record<string, unknown> = {
      status,
      applyToLinked: showLinkedOption ? applyToLinked : undefined,
    };
    if (vehicleId) payload.vehicleId = Number(vehicleId);
    if (pickerId) payload.pickerId = Number(pickerId);

    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        onError(data.error ?? "Could not update status");
        return;
      }
      onUpdated();
    } finally {
      setBusy(false);
    }
  }

  const unchanged =
    status === resolvedStatus &&
    vehicleId === (currentVehicleId ? String(currentVehicleId) : "") &&
    pickerId === (currentPickerId ? String(currentPickerId) : "");
  const pastDateNote =
    orderDate &&
    (status === "delivered" || status === "partially_delivered")
      ? pastWorkDateCompletionNote({
          orderDate,
          requestedDeliveryDate,
        })
      : null;

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-zinc-300 bg-white p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1">
          <Select
            label="Manual status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ManualOrderStatus)}
          >
            {MANUAL_ORDER_STATUSES.map((s) => (
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
          {busy
            ? linkedUpdateCount > 1
              ? `Updating ${linkedUpdateCount} orders…`
              : "Saving…"
            : "Update status"}
        </Button>
      </div>

      {pastDateNote && (
        <p className="text-xs leading-snug text-amber-800">{pastDateNote}</p>
      )}

      {busy && linkedUpdateCount > 1 && (
        <p className="text-xs text-amber-800">
          Updating {linkedUpdateCount} linked orders — please wait…
        </p>
      )}

      {showAttribution && (
        <div className="grid gap-3 border-t border-zinc-100 pt-3 sm:grid-cols-2">
          {vehicles.length > 0 && (
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

      {showAttribution && (vehicleId || pickerId) && (
        <p className="text-[11px] leading-snug text-zinc-500">
          Truck and preparer are saved for reporting without step times. Change
          them here when you update status.
        </p>
      )}

      {showLinkedOption && (
        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-sky-100 bg-sky-50/80 px-3 py-2 text-xs text-sky-950">
          <input
            type="checkbox"
            className="mt-0.5 rounded border-zinc-300"
            checked={applyToLinked}
            onChange={(e) => setApplyToLinked(e.target.checked)}
          />
          <span>
            {isRevertFromDelivered
              ? `Set linked orders to ${STATUS_LABELS[status] ?? status} too (${partners.map((p) => p.invoiceNumber).join(", ")})`
              : `Mark linked orders delivered too (${partners.map((p) => p.invoiceNumber).join(", ")})`}
          </span>
        </label>
      )}
    </div>
  );
}
