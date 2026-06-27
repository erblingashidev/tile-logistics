"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { deliveryRoundSelectOptions } from "@/lib/delivery-rounds";

interface VehicleOption {
  id: number;
  name: string;
  plateNumber: string;
  assignedDriver?: { name: string } | null;
}

interface PickerOption {
  id: number;
  name: string;
}

export interface AssignmentDraft {
  vehicleId: string;
  round: string;
  pickerId: string;
}

interface OrderAssignmentPanelProps {
  orderId: number;
  invoiceNumber: string;
  hasAssignment: boolean;
  hasProgress: boolean;
  draft: AssignmentDraft;
  vehicles: VehicleOption[];
  pickers: PickerOption[];
  onDraftChange: (draft: AssignmentDraft) => void;
  onSaved: () => void;
  onError: (message: string) => void;
  onWarning: (message: string) => void;
}

async function promptAdminPin(message: string): Promise<string | null> {
  const pin = window.prompt(`${message}\n\nEnter admin PIN (same as admin password):`);
  return pin?.trim() || null;
}

export function OrderAssignmentPanel({
  orderId,
  invoiceNumber,
  hasAssignment,
  hasProgress,
  draft,
  vehicles,
  pickers,
  onDraftChange,
  onSaved,
  onError,
  onWarning,
}: OrderAssignmentPanelProps) {
  const [busy, setBusy] = useState(false);

  async function saveBundle(
    ignoreWeightWarning = false,
    ignoreCraneRule = false
  ) {
    if (!draft.vehicleId) {
      onError("Select a truck first.");
      return;
    }
    setBusy(true);
    onError("");
    const res = await fetch(`/api/orders/${orderId}/assign-bundle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleId: Number(draft.vehicleId),
        deliveryRound: Number(draft.round) || 1,
        pickerId: draft.pickerId ? Number(draft.pickerId) : null,
        autoAssignTeam: true,
        ignoreWeightWarning,
        ignoreCraneRule,
      }),
    });
    const data = await res.json();
    setBusy(false);

    if (res.status === 422 && data.isWeightWarning) {
      if (
        confirm(
          `${data.error}\n\nThis is a weight warning only. Assign anyway?`
        )
      ) {
        await saveBundle(true, ignoreCraneRule);
      }
      return;
    }
    if (res.status === 409 && data.requiresCrane && !ignoreCraneRule) {
      if (
        confirm(
          `${data.error}\n\nOverride and assign to this truck anyway?`
        )
      ) {
        await saveBundle(ignoreWeightWarning, true);
      }
      return;
    }
    if (!res.ok) {
      onError(data.error ?? "Could not save assignment");
      return;
    }
    if (data.weightWarning) onWarning(data.weightWarning);
    if (data.craneWarning) onWarning(data.craneWarning);
    if (data.scheduleWarning) onWarning(data.scheduleWarning);
    onSaved();
  }

  async function loadSuggestion() {
    setBusy(true);
    onError("");
    const res = await fetch(
      `/api/dispatch/recommend?orderId=${orderId}&deliveryRound=${Number(draft.round) || 1}`
    );
    const data = await res.json();
    setBusy(false);
    if (!res.ok || !data.ok) {
      onError(data.error ?? "No suggestion available");
      return;
    }
    const rec = data.recommendation;
    onDraftChange({
      vehicleId: String(rec.vehicleId),
      round: String(rec.deliveryRound),
      pickerId: rec.pickerId ? String(rec.pickerId) : "",
    });
    onWarning(`AI suggestion loaded — review truck & picker, then save. ${rec.reasons[0] ?? ""}`);
  }

  async function clearScope(scope: {
    truck?: boolean;
    picker?: boolean;
    driver?: boolean;
    helpers?: boolean;
  }) {
    const labels = [
      scope.truck && "truck",
      scope.picker && "picker",
      scope.driver && "driver",
      scope.helpers && "helpers",
    ].filter(Boolean);
    if (labels.length === 0) return;

    if (
      !confirm(
        `Clear ${labels.join(", ")} for ${invoiceNumber}?`
      )
    ) {
      return;
    }

    let adminPin: string | undefined;
    if (hasProgress) {
      const pin = await promptAdminPin(
        "Delivery progress exists on this order."
      );
      if (!pin) return;
      adminPin = pin;
    }

    setBusy(true);
    const res = await fetch(`/api/orders/${orderId}/clear-assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, adminPin }),
    });
    const data = await res.json();
    setBusy(false);

    if (res.status === 403 && data.requiresPin) {
      onError(data.error ?? "Admin PIN required");
      return;
    }
    if (!res.ok) {
      onError(data.error ?? "Could not clear");
      return;
    }
    if (data.cleared?.length) {
      onWarning(`Cleared: ${data.cleared.join(", ")}`);
    }
    onDraftChange({ vehicleId: "", round: draft.round, pickerId: "" });
    onSaved();
  }

  async function resetDelivery() {
    if (
      !confirm(
        `RESET delivery for ${invoiceNumber}?\n\nRemoves truck, picker, driver, helpers, AND all proof steps (loaded, departed, etc.). This cannot be undone.`
      )
    ) {
      return;
    }
    const pin = await promptAdminPin("Confirm delivery reset");
    if (!pin) return;

    setBusy(true);
    const res = await fetch(`/api/orders/${orderId}/reset-delivery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminPin: pin }),
    });
    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      onError(data.error ?? "Reset failed");
      return;
    }
    onWarning(
      `Delivery reset (${data.proofsRemoved ?? 0} proof steps removed)`
    );
    onDraftChange({ vehicleId: "", round: "1", pickerId: "" });
    onSaved();
  }

  return (
    <div className="flex min-w-[260px] flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50/80 p-2.5">
      <p className="text-xs font-semibold text-zinc-800">Assignment</p>

      <select
        className="rounded border bg-white px-2 py-1 text-xs"
        value={draft.pickerId}
        onChange={(e) =>
          onDraftChange({ ...draft, pickerId: e.target.value })
        }
      >
        <option value="">Picker…</option>
        {pickers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <select
        className="rounded border bg-white px-2 py-1 text-xs"
        value={draft.vehicleId}
        onChange={(e) =>
          onDraftChange({ ...draft, vehicleId: e.target.value })
        }
      >
        <option value="">Truck…</option>
        {vehicles.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name} ({v.plateNumber})
            {v.assignedDriver ? ` — ${v.assignedDriver.name}` : ""}
          </option>
        ))}
      </select>

      <select
        className="rounded border bg-white px-2 py-1 text-xs"
        value={draft.round}
        onChange={(e) => onDraftChange({ ...draft, round: e.target.value })}
        title="Each round is one trip: morning first, then orders for when the truck comes back"
      >
        {deliveryRoundSelectOptions().map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <p className="text-[10px] leading-snug text-zinc-500">
        Round 1 = first trip out. Round 2 = same truck after it returns.
      </p>

      <Button
        className="w-full text-xs"
        disabled={busy}
        onClick={() => saveBundle()}
      >
        {hasAssignment ? "Save assignment" : "Assign truck + picker"}
      </Button>
      {hasAssignment && draft.vehicleId && (
        <p className="text-[10px] leading-snug text-amber-800">
          Changing truck here moves this order to another vehicle (keeps picker).
        </p>
      )}

      {!hasAssignment && (
        <Button
          variant="secondary"
          className="w-full text-xs"
          disabled={busy}
          onClick={loadSuggestion}
        >
          AI suggest truck + picker
        </Button>
      )}

      <div className="flex flex-wrap gap-1 border-t border-zinc-200 pt-2">
        <Button
          variant="ghost"
          className="text-[11px] px-2 py-1"
          disabled={busy}
          onClick={() =>
            clearScope({
              truck: true,
              picker: true,
              driver: true,
              helpers: true,
            })
          }
        >
          Clear all
        </Button>
        <Button
          variant="ghost"
          className="text-[11px] px-2 py-1"
          disabled={busy}
          onClick={() => clearScope({ truck: true })}
        >
          Clear truck
        </Button>
        <Button
          variant="ghost"
          className="text-[11px] px-2 py-1"
          disabled={busy}
          onClick={() => clearScope({ picker: true, helpers: true })}
        >
          Clear picker
        </Button>
      </div>

      {(hasAssignment || hasProgress) && (
        <Button
          variant="ghost"
          className="w-full text-xs text-red-700"
          disabled={busy}
          onClick={resetDelivery}
        >
          Reset delivery…
        </Button>
      )}

      <p className="text-[10px] leading-snug text-zinc-500">
        Driver auto-fills from truck. Picker auto-fills from truck defaults
        (Vehicles page). Helpers auto-join when picker is saved. Jumbo tiles
        (&gt;2 pcs of 160×160, 120×280, etc.) require the crane truck.
      </p>
    </div>
  );
}
