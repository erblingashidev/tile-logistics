"use client";

import { useMemo, useState } from "react";
import { Alert, Button, Input } from "@/components/ui";
import {
  DELIVERY_PROOF_LABELS,
  type DeliveryProofPhase,
} from "@/lib/constants";
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
  const [employeeId, setEmployeeId] = useState("");
  const [showNotesFor, setShowNotesFor] = useState<string | null>(null);

  const actions = useMemo(() => {
    const list: Array<{
      phase: DeliveryProofPhase;
      label: string;
      variant?: "primary" | "secondary" | "danger";
      needsNotes?: boolean;
      hint?: string;
    }> = [];

    if (
      !hasPhase(proofPhases, "prepared") &&
      prepStatus !== "prepared" &&
      loadStatus !== "loaded" &&
      loadStatus !== "load_skipped"
    ) {
      list.push({ phase: "prepared", label: "Mark prepared", variant: "secondary" });
    }

    if (
      (prepStatus === "prepared" || hasPhase(proofPhases, "prepared")) &&
      loadStatus === "pending" &&
      !hasPhase(proofPhases, "loaded") &&
      !hasPhase(proofPhases, "load_skipped")
    ) {
      list.push({ phase: "loaded", label: "Mark loaded on truck", variant: "primary" });
      list.push({
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
      list.push({ phase: "arrived", label: "Arrived at customer", variant: "secondary" });
    }

    if (
      (hasPhase(proofPhases, "departed") || deliveryStage === "in_transit" || deliveryStage === "arrived") &&
      !hasPhase(proofPhases, "delivered") &&
      loadStatus !== "load_skipped"
    ) {
      list.push({
        phase: "delivered",
        label: "Close ticket — delivered",
        variant: "primary",
        needsNotes: true,
        hint: "Use when the driver confirmed by phone. Add a short note.",
      });
    }

    return list;
  }, [proofPhases, prepStatus, loadStatus, deliveryStage]);

  async function submit(phase: DeliveryProofPhase, needsNotes?: boolean) {
    if (needsNotes && !notes.trim()) {
      setShowNotesFor(phase);
      onError("Add a note explaining what happened.");
      return;
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
        allowDeliveredWithoutPhoto: phase === "delivered",
        force: phase === "loaded" || phase === "delivered",
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusyPhase(null);

    if (!res.ok) {
      onError(data.error ?? "Could not record proof step");
      return;
    }

    setNotes("");
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

      {(showNotesFor || notes) && (
        <div className="mt-3">
          <Input
            label="Note"
            hint="Required for delivery close or cannot-load"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action.phase}
            type="button"
            variant={action.variant ?? "secondary"}
            disabled={busyPhase != null}
            onClick={() => {
              if (action.needsNotes && !notes.trim()) {
                setShowNotesFor(action.phase);
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
              void submit(action.phase, action.needsNotes);
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
              <p key={action.hint} className="text-[11px] text-amber-800">
                {DELIVERY_PROOF_LABELS[action.phase]}: {action.hint}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
