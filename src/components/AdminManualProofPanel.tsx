"use client";

import { useMemo, useState } from "react";
import { Alert, Button, Input } from "@/components/ui";
import { type DeliveryProofPhase } from "@/lib/constants";
import type { OrderDisplayStage } from "@/lib/order-display";

interface StaffOption {
  id: number;
  name: string;
  role: string;
}

interface AdminManualProofPanelProps {
  orderId: number;
  invoiceNumber: string;
  proofPhases?: string[];
  deliveryStage?: OrderDisplayStage;
  prepStatus?: "pending" | "prepared";
  loadStatus?: "pending" | "loaded" | "load_skipped";
  staffOptions?: StaffOption[];
  onSaved: () => void;
  onError: (message: string) => void;
}

function hasPhase(proofPhases: string[], phase: string) {
  return proofPhases.includes(phase);
}

export function AdminManualProofPanel({
  orderId,
  invoiceNumber,
  proofPhases = [],
  deliveryStage,
  prepStatus,
  loadStatus,
  staffOptions = [],
  onSaved,
  onError,
}: AdminManualProofPanelProps) {
  const [busyPhase, setBusyPhase] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [sentPallets, setSentPallets] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [showNotesFor, setShowNotesFor] = useState<string | null>(null);

  const actions = useMemo(() => {
    const list: Array<{
      id: string;
      phase: DeliveryProofPhase;
      label: string;
      variant?: "primary" | "secondary" | "danger";
      needsNotes?: boolean;
      needsPartialLoad?: boolean;
      hint?: string;
    }> = [];

    if (
      !hasPhase(proofPhases, "prepared") &&
      prepStatus !== "prepared" &&
      loadStatus !== "loaded" &&
      loadStatus !== "load_skipped"
    ) {
      list.push({
        id: "prepared",
        phase: "prepared",
        label: "Mark prepared",
        variant: "secondary",
      });
    }

    if (
      (prepStatus === "prepared" || hasPhase(proofPhases, "prepared")) &&
      loadStatus === "pending" &&
      !hasPhase(proofPhases, "loaded") &&
      !hasPhase(proofPhases, "load_skipped")
    ) {
      list.push({
        id: "loaded-full",
        phase: "loaded",
        label: "Mark loaded — full remaining",
        variant: "primary",
      });
      list.push({
        id: "loaded-partial",
        phase: "loaded",
        label: "Partial load — enter pallets",
        variant: "secondary",
        needsPartialLoad: true,
        hint: "Picker confirms only part of the order goes on this truck.",
      });
      list.push({
        id: "load_skipped",
        phase: "load_skipped",
        label: "Could not load",
        variant: "danger",
        needsNotes: true,
      });
    }

    if (
      loadStatus === "loaded" &&
      !hasPhase(proofPhases, "departed") &&
      deliveryStage !== "in_transit" &&
      deliveryStage !== "delivered"
    ) {
      list.push({
        id: "departed",
        phase: "departed",
        label: "Truck departed",
        variant: "primary",
        hint: "Marks all loaded orders on this truck as on the way.",
      });
    }

    if (
      hasPhase(proofPhases, "departed") &&
      !hasPhase(proofPhases, "arrived") &&
      !hasPhase(proofPhases, "delivered")
    ) {
      list.push({
        id: "arrived",
        phase: "arrived",
        label: "Arrived at customer",
        variant: "secondary",
      });
    }

    if (
      (hasPhase(proofPhases, "departed") || deliveryStage === "in_transit" || deliveryStage === "arrived") &&
      !hasPhase(proofPhases, "delivered") &&
      loadStatus !== "load_skipped"
    ) {
      list.push({
        id: "delivered",
        phase: "delivered",
        label: "Close ticket — full remaining delivered",
        variant: "primary",
        needsNotes: true,
        hint: "Use when the driver confirmed by phone. Add a short note.",
      });
      list.push({
        id: "partial_delivery",
        phase: "partial_delivery",
        label: "Partial delivery — enter pallets sent",
        variant: "secondary",
        needsNotes: true,
        hint: "Records how much went now; remainder stays open for another truck.",
      });
    }

    return list;
  }, [proofPhases, prepStatus, loadStatus, deliveryStage]);

  async function submit(
    phase: DeliveryProofPhase,
    opts?: { needsNotes?: boolean; needsPartialLoad?: boolean }
  ) {
    if (opts?.needsNotes && !notes.trim()) {
      setShowNotesFor(phase);
      onError("Add a note explaining what happened.");
      return;
    }

    let qty: number | undefined;
    if (phase === "partial_delivery" || opts?.needsPartialLoad) {
      qty = Number(sentPallets);
      if (!Number.isFinite(qty) || qty <= 0) {
        setShowNotesFor(phase);
        onError(
          opts?.needsPartialLoad
            ? "Enter how many pallets are going on this truck."
            : "Enter how many pallets were delivered on this trip."
        );
        return;
      }
    }

    setBusyPhase(phase);
    onError("");

    const res = await fetch(`/api/orders/${orderId}/proof`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phase,
        notes: notes.trim() || undefined,
        employeeId: employeeId ? Number(employeeId) : undefined,
        allowDeliveredWithoutPhoto:
          phase === "delivered" || phase === "partial_delivery",
        force:
          phase === "loaded" ||
          phase === "delivered" ||
          phase === "partial_delivery",
        sentPallets: qty,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusyPhase(null);

    if (!res.ok) {
      onError(data.error ?? "Could not record proof step");
      return;
    }

    setNotes("");
    setSentPallets("");
    setShowNotesFor(null);
    onSaved();
  }

  if (deliveryStage === "delivered" || deliveryStage === "cancelled") {
    return null;
  }

  if (actions.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/80 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
        Manual warehouse / driver steps
      </p>
      <p className="mt-1 text-xs text-amber-800">
        Use when staff confirm by phone — same steps as the mobile portal for{" "}
        {invoiceNumber}.
      </p>

      {staffOptions.length > 0 && (
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-amber-900">
            Record as (optional)
          </label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="w-full rounded border border-amber-200 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">Auto — assigned picker/driver</option>
            {staffOptions.map((member) => (
              <option key={`${member.role}-${member.id}`} value={member.id}>
                {member.name} ({member.role})
              </option>
            ))}
          </select>
        </div>
      )}

      {(showNotesFor || notes || sentPallets) && (
        <div className="mt-3 space-y-2">
          <Input
            label="Note"
            hint="Required for delivery close, partial delivery, or cannot-load"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {(showNotesFor === "partial_delivery" ||
            showNotesFor === "loaded" ||
            actions.some(
              (a) => a.phase === "partial_delivery" || a.needsPartialLoad
            )) && (
            <Input
              label="Pallets on this trip"
              type="number"
              value={sentPallets}
              onChange={(e) => setSentPallets(e.target.value)}
              hint="Required for partial load or partial delivery"
            />
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action.id}
            type="button"
            variant={action.variant ?? "secondary"}
            disabled={busyPhase != null}
            onClick={() => {
              if (action.needsNotes && !notes.trim()) {
                setShowNotesFor(action.phase);
                return;
              }
              if (action.needsPartialLoad && !sentPallets.trim()) {
                setShowNotesFor(action.phase);
                onError("Enter how many pallets are going on this truck.");
                return;
              }
              if (
                action.phase === "delivered" &&
                !confirm(
                  `Mark ${invoiceNumber} as delivered?\n\nOnly do this if the driver confirmed delivery.`
                )
              ) {
                return;
              }
              void submit(action.phase, {
                needsNotes: action.needsNotes,
                needsPartialLoad: action.needsPartialLoad,
              });
            }}
          >
            {busyPhase === action.phase ? "Saving…" : action.label}
          </Button>
        ))}
      </div>

      {actions.some((action) => action.hint) && (
        <div className="mt-2 space-y-1">
          {actions
            .filter((action) => action.hint)
            .map((action) => (
              <p key={action.id} className="text-[11px] text-amber-800">
                {action.label}: {action.hint}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
