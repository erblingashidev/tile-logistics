"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui";
import { deliveryRoundSelectOptions } from "@/lib/delivery-rounds";

interface VehicleOption {
  id: number;
  name: string;
  plateNumber: string;
  maxPallets?: number;
  assignedDriver?: { name: string } | null;
  loads?: Array<{
    round: number;
    totals: { pallets: number; weightKg: number };
  }>;
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
  orderPallets?: number;
  hasAssignment: boolean;
  hasProgress: boolean;
  draft: AssignmentDraft;
  vehicles: VehicleOption[];
  pickers: PickerOption[];
  preferredVehicleId?: string;
  onDraftChange: (draft: AssignmentDraft) => void;
  onSaved: () => void;
  onError: (message: string) => void;
  onWarning: (message: string) => void;
}

async function promptAdminPin(message: string): Promise<string | null> {
  const pin = window.prompt(`${message}\n\nEnter admin PIN (same as admin password):`);
  return pin?.trim() || null;
}

function palletsOnTruck(vehicle: VehicleOption, round: number): number {
  return (
    vehicle.loads?.find((load) => load.round === round)?.totals.pallets ?? 0
  );
}

function chipClass(selected: boolean) {
  if (selected) {
    return "border-zinc-900 bg-zinc-900 text-white";
  }
  return "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-400 hover:bg-zinc-50";
}

function ChoiceChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex items-center rounded-md border-2 px-2.5 py-1.5 text-xs font-medium transition ${chipClass(
        selected
      )}`}
    >
      {children}
    </button>
  );
}

export function OrderAssignmentPanel({
  orderId,
  invoiceNumber,
  orderPallets = 0,
  hasAssignment,
  hasProgress,
  draft,
  vehicles,
  pickers,
  preferredVehicleId,
  onDraftChange,
  onSaved,
  onError,
  onWarning,
}: OrderAssignmentPanelProps) {
  const [busy, setBusy] = useState(false);
  const [quickAssign, setQuickAssign] = useState(false);
  const round = Number(draft.round) || 1;

  const sortedVehicles = [...vehicles].sort((a, b) => {
    if (preferredVehicleId) {
      if (String(a.id) === preferredVehicleId) return -1;
      if (String(b.id) === preferredVehicleId) return 1;
    }
    if (draft.vehicleId) {
      if (String(a.id) === draft.vehicleId) return -1;
      if (String(b.id) === draft.vehicleId) return 1;
    }
    return a.name.localeCompare(b.name);
  });

  async function saveBundle(
    ignoreWeightWarning = false,
    ignoreCraneRule = false,
    overrideDraft?: AssignmentDraft
  ) {
    const active = overrideDraft ?? draft;
    if (!active.vehicleId) {
      onError("Select a truck first.");
      return;
    }
    setBusy(true);
    onError("");
    const res = await fetch(`/api/orders/${orderId}/assign-bundle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleId: Number(active.vehicleId),
        deliveryRound: Number(active.round) || 1,
        pickerId: active.pickerId ? Number(active.pickerId) : null,
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
        await saveBundle(true, ignoreCraneRule, active);
      }
      return;
    }
    if (res.status === 409 && data.requiresCrane && !ignoreCraneRule) {
      if (
        confirm(
          `${data.error}\n\nOverride and assign to this truck anyway?`
        )
      ) {
        await saveBundle(ignoreWeightWarning, true, active);
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

  function selectTruck(vehicleId: string) {
    const next = { ...draft, vehicleId };
    onDraftChange(next);
    if (quickAssign && vehicleId) {
      void saveBundle(false, false, next);
    }
  }

  function selectPicker(pickerId: string) {
    onDraftChange({ ...draft, pickerId });
  }

  function selectRound(nextRound: string) {
    onDraftChange({ ...draft, round: nextRound });
  }

  async function loadSuggestion() {
    setBusy(true);
    onError("");
    const res = await fetch(
      `/api/dispatch/recommend?orderId=${orderId}&deliveryRound=${round}`
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
    <div className="flex w-full flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Assign
        </p>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-600">
          <input
            type="checkbox"
            checked={quickAssign}
            onChange={(e) => setQuickAssign(e.target.checked)}
          />
          Assign on truck click
        </label>
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
          Delivery round
        </p>
        <div className="flex flex-wrap gap-1.5">
          {deliveryRoundSelectOptions().map((option) => (
            <ChoiceChip
              key={option.value}
              selected={draft.round === String(option.value)}
              onClick={() => selectRound(String(option.value))}
            >
              {option.label}
            </ChoiceChip>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
          Picker
        </p>
        <div className="flex flex-wrap gap-1.5">
          <ChoiceChip
            selected={!draft.pickerId}
            onClick={() => selectPicker("")}
          >
            Auto
          </ChoiceChip>
          {pickers.map((picker) => (
            <ChoiceChip
              key={picker.id}
              selected={draft.pickerId === String(picker.id)}
              onClick={() =>
                selectPicker(
                  draft.pickerId === String(picker.id)
                    ? ""
                    : String(picker.id)
                )
              }
            >
              {picker.name}
            </ChoiceChip>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
          Truck
        </p>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {sortedVehicles.map((vehicle) => {
            const selected = draft.vehicleId === String(vehicle.id);
            const isPreferred = preferredVehicleId === String(vehicle.id);
            const onTruck = palletsOnTruck(vehicle, round);
            const max = vehicle.maxPallets ?? 0;
            const remaining = max > 0 ? Math.max(0, max - onTruck) : null;
            const fits =
              orderPallets <= 0 ||
              remaining == null ||
              orderPallets <= remaining + 0.01;
            const loadPct =
              max > 0 ? Math.min(100, Math.round((onTruck / max) * 100)) : 0;

            return (
              <button
                key={vehicle.id}
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  selectTruck(selected ? "" : String(vehicle.id))
                }
                className={`flex w-full cursor-pointer flex-col gap-1.5 rounded-lg border-2 p-2.5 text-left transition ${
                  selected
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : isPreferred
                      ? "border-blue-300 bg-blue-50/60 hover:border-blue-400"
                      : fits
                        ? "border-zinc-200 bg-zinc-50/50 hover:border-zinc-400"
                        : "border-amber-200 bg-amber-50/40 hover:border-amber-300"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p
                      className={`truncate text-sm font-semibold ${
                        selected ? "text-white" : "text-zinc-900"
                      }`}
                    >
                      {vehicle.name}
                    </p>
                    <p
                      className={`text-[11px] ${
                        selected ? "text-zinc-300" : "text-zinc-500"
                      }`}
                    >
                      {vehicle.plateNumber}
                      {vehicle.assignedDriver
                        ? ` · ${vehicle.assignedDriver.name}`
                        : ""}
                    </p>
                  </div>
                  {isPreferred && !selected && (
                    <span className="shrink-0 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      Focus
                    </span>
                  )}
                </div>
                {max > 0 && (
                  <div>
                    <div
                      className={`h-1.5 overflow-hidden rounded-full ${
                        selected ? "bg-zinc-700" : "bg-zinc-200"
                      }`}
                    >
                      <div
                        className={`h-full rounded-full ${
                          selected
                            ? "bg-white"
                            : loadPct >= 90
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                        }`}
                        style={{ width: `${loadPct}%` }}
                      />
                    </div>
                    <p
                      className={`mt-1 text-[10px] ${
                        selected ? "text-zinc-300" : "text-zinc-500"
                      }`}
                    >
                      {onTruck.toFixed(1)} / {max} plt
                      {remaining != null ? ` · ${remaining.toFixed(1)} free` : ""}
                      {!fits && orderPallets > 0 ? " · tight fit" : ""}
                    </p>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          className="text-xs"
          disabled={busy || !draft.vehicleId}
          onClick={() => saveBundle()}
        >
          {hasAssignment ? "Save assignment" : "Assign truck + picker"}
        </Button>
        {!hasAssignment && (
          <Button
            variant="secondary"
            className="text-xs"
            disabled={busy}
            onClick={loadSuggestion}
          >
            AI suggest
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1 border-t border-zinc-100 pt-2">
        <Button
          variant="ghost"
          className="px-2 py-1 text-[11px]"
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
          className="px-2 py-1 text-[11px]"
          disabled={busy}
          onClick={() => clearScope({ truck: true })}
        >
          Clear truck
        </Button>
        <Button
          variant="ghost"
          className="px-2 py-1 text-[11px]"
          disabled={busy}
          onClick={() => clearScope({ picker: true, helpers: true })}
        >
          Clear picker
        </Button>
        {(hasAssignment || hasProgress) && (
          <Button
            variant="ghost"
            className="px-2 py-1 text-[11px] text-red-700"
            disabled={busy}
            onClick={resetDelivery}
          >
            Reset delivery
          </Button>
        )}
      </div>
    </div>
  );
}
