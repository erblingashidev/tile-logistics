"use client";

import { useEffect, useState } from "react";
import { Button, Select } from "@/components/ui";
import { MANUAL_ORDER_STATUSES, type ManualOrderStatus } from "@/lib/constants";
import { manualStatusFromOrder } from "@/lib/manual-order-status-display";

interface LinkedOrder {
  id: number;
  invoiceNumber: string;
}

interface ManualOrderStatusSelectProps {
  orderId: number;
  currentStatus: string;
  prepStatus?: "pending" | "prepared";
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
  linkedOrders = [],
  onUpdated,
  onError,
}: ManualOrderStatusSelectProps) {
  const resolvedStatus = manualStatusFromOrder({ status: currentStatus, prepStatus });
  const [status, setStatus] = useState(resolvedStatus);
  const [applyToLinked, setApplyToLinked] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStatus(manualStatusFromOrder({ status: currentStatus, prepStatus }));
  }, [currentStatus, prepStatus]);

  const partners = linkedOrders.filter((link) => link.id !== orderId);
  const showLinkedOption = status === "delivered" && partners.length > 0;

  async function save() {
    setBusy(true);
    onError("");

    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        applyToLinked: showLinkedOption ? applyToLinked : undefined,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      onError(data.error ?? "Could not update status");
      return;
    }
    onUpdated();
  }

  const unchanged = status === resolvedStatus;

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
          {busy ? "Saving…" : "Update status"}
        </Button>
      </div>

      {showLinkedOption && (
        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-sky-100 bg-sky-50/80 px-3 py-2 text-xs text-sky-950">
          <input
            type="checkbox"
            className="mt-0.5 rounded border-zinc-300"
            checked={applyToLinked}
            onChange={(e) => setApplyToLinked(e.target.checked)}
          />
          <span>
            Mark linked orders delivered too (
            {partners.map((p) => p.invoiceNumber).join(", ")})
          </span>
        </label>
      )}
    </div>
  );
}
