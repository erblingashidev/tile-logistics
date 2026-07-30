"use client";

import { useState } from "react";
import { Button, Select } from "@/components/ui";
import { ORDER_STATUSES } from "@/lib/constants";

interface ManualOrderStatusSelectProps {
  orderId: number;
  currentStatus: string;
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
  onUpdated,
  onError,
}: ManualOrderStatusSelectProps) {
  const [status, setStatus] = useState(currentStatus);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      onError(data.error ?? "Could not update status");
      return;
    }
    onUpdated();
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-zinc-300 bg-white p-3">
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
        disabled={busy || status === currentStatus}
        onClick={() => void save()}
      >
        {busy ? "Saving…" : "Update status"}
      </Button>
    </div>
  );
}
