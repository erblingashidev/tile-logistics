"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Alert,
} from "@/components/ui";
import {
  DELIVERY_PROOF_LABELS,
  DELIVERY_PROOF_PHASES,
  EMPLOYEE_STATUSES,
  type DeliveryProofPhase,
  type EmployeeRole,
} from "@/lib/constants";
import { BRAND } from "@/lib/brand";
import { formatDeliverySchedule } from "@/lib/delivery-schedule";
import type { OrderDisplayStage } from "@/lib/order-display";

interface PortalOrder {
  id: number;
  invoiceNumber: string;
  customerName: string;
  region?: string | null;
  location: string;
  deliveryStage?: OrderDisplayStage;
  deliveryStageLabel?: string;
  orderDate: string;
  requestedDeliveryDate?: string | null;
  deliveryTimePreference?: string | null;
  status: string;
  totalPallets: number;
  totalM2: number;
  loadStatus?: "pending" | "loaded" | "load_skipped";
  loadNotes?: string | null;
  assignment?: {
    vehicleId?: number;
    vehicleName: string;
    plateNumber: string;
    deliveryRound: number;
  } | null;
  staff?: {
    picker?: { employeeName: string } | null;
    driver?: { employeeName: string } | null;
  };
  proofs?: Array<{
    phase: string;
    employeeName: string;
    capturedAt: string;
    photoUrl?: string | null;
    notes?: string | null;
  }>;
}

interface TruckLoadGroup {
  vehicleId: number;
  vehicleName: string;
  plateNumber: string;
  deliveryRound: number;
  orders: Array<{
    orderId: number;
    invoiceNumber: string;
    customerName: string;
    loadStatus: "pending" | "loaded" | "load_skipped";
    loadNotes: string | null;
    awaitingDepart?: boolean;
  }>;
  totalOrders: number;
  resolvedCount: number;
  pendingCount: number;
  allResolved: boolean;
  canDepart: boolean;
  hasFullyDeparted: boolean;
  awaitingDepartCount: number;
}

interface PortalEmployee {
  employeeId: number;
  name: string;
  roles: EmployeeRole[];
  status?: string;
}

const statusTone: Record<string, "green" | "amber" | "blue" | "red" | "slate"> =
  {
    available: "green",
    busy: "blue",
    on_break: "amber",
    off_duty: "slate",
    pending: "amber",
    assigned: "blue",
    in_transit: "blue",
    delivered: "green",
    cancelled: "red",
  };

function hasProof(order: PortalOrder, phase: string) {
  return (order.proofs ?? []).some((p) => p.phase === phase);
}

export default function PortalPage() {
  const router = useRouter();
  const [employee, setEmployee] = useState<PortalEmployee | null>(null);
  const [myStatus, setMyStatus] = useState("available");
  const [orders, setOrders] = useState<PortalOrder[]>([]);
  const [truckGroups, setTruckGroups] = useState<TruckLoadGroup[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busyOrderId, setBusyOrderId] = useState<number | null>(null);
  const [skipNotes, setSkipNotes] = useState<Record<number, string>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/portal/orders", { cache: "no-store" });
    if (res.status === 401) {
      router.push("/login");
      return;
    }
    const data = await res.json();
    setEmployee(data.employee);
    setMyStatus(data.employee?.status ?? "available");
    setOrders(data.orders ?? []);
    setTruckGroups(data.truckGroups ?? []);
  }, [router]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  async function setStatus(status: string) {
    setError("");
    const res = await fetch("/api/portal/me/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Could not update status");
      return;
    }
    setMyStatus(status);
    setSuccess("Status updated");
    setTimeout(() => setSuccess(""), 2000);
  }

  async function submitProof(
    orderId: number,
    phase: DeliveryProofPhase,
    notes?: string
  ) {
    setError("");
    setSuccess("");
    setBusyOrderId(orderId);

    const phaseDef = DELIVERY_PROOF_PHASES.find((p) => p.id === phase);
    const input = fileRefs.current[`${orderId}-${phase}`];
    const file = input?.files?.[0];

    if (phaseDef?.photoRequired && !file) {
      setError("Please add a photo for delivery proof.");
      setBusyOrderId(null);
      return;
    }

    if (phaseDef?.notesRequired && !notes?.trim()) {
      setError("Please explain why this order could not be loaded.");
      setBusyOrderId(null);
      return;
    }

    const form = new FormData();
    form.set("phase", phase);
    if (file) form.set("photo", file);
    if (notes?.trim()) form.set("notes", notes.trim());

    try {
      if (navigator.geolocation) {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 5000,
          })
        ).catch(() => null);
        if (pos) {
          form.set("lat", String(pos.coords.latitude));
          form.set("lng", String(pos.coords.longitude));
        }
      }
    } catch {
      /* optional */
    }

    const res = await fetch(`/api/portal/orders/${orderId}/proof`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    setBusyOrderId(null);

    if (!res.ok) {
      setError(data.error ?? "Could not save proof");
      return;
    }

    if (input) input.value = "";
    setSuccess(
      phase === "departed"
        ? "Truck left the warehouse — loaded orders are on the way"
        : `${DELIVERY_PROOF_LABELS[phase]} saved`
    );
    setTimeout(() => setSuccess(""), 3000);
    load();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const isLoader =
    employee?.roles.some((r) => r === "picker" || r === "unloader") ?? false;
  const isDriver = employee?.roles.includes("driver") ?? false;

  function loaderPhasesForOrder(order: PortalOrder) {
    if (!isLoader) return [];
    if (order.loadStatus === "loaded" || order.loadStatus === "load_skipped") {
      return [];
    }
    return DELIVERY_PROOF_PHASES.filter(
      (p) => p.id === "loaded" || p.id === "load_skipped"
    );
  }

  function driverPhasesForOrder(order: PortalOrder) {
    if (!isDriver) return [];
    if (order.loadStatus === "load_skipped") return [];
    if (!hasProof(order, "departed")) return [];
    return DELIVERY_PROOF_PHASES.filter(
      (p) => p.id === "arrived" || p.id === "delivered"
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-900">{BRAND.shortName}</p>
            <p className="text-xs text-zinc-500">{employee?.name ?? "…"}</p>
          </div>
          <Button variant="ghost" className="text-xs" onClick={logout}>
            Log out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-4 pb-12">
        {error && <Alert tone="error">{error}</Alert>}
        {success && <Alert tone="warning">{success}</Alert>}

        <Card className="p-4">
          <p className="text-sm font-medium text-zinc-900">My status</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {EMPLOYEE_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`rounded-full px-3 py-1.5 text-sm capitalize ${
                  myStatus === s
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-200 text-zinc-700"
                }`}
              >
                {s.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </Card>

        {isDriver &&
          truckGroups.map((truck) => (
            <Card key={`${truck.vehicleId}-${truck.deliveryRound}`} className="p-4">
              <p className="text-sm font-semibold text-zinc-900">
                {truck.vehicleName} ({truck.plateNumber}) · Round{" "}
                {truck.deliveryRound}
              </p>
              <p className="mt-1 text-xs text-zinc-600">
                Loading: {truck.resolvedCount}/{truck.totalOrders} orders ready
                {truck.pendingCount > 0 &&
                  ` · ${truck.pendingCount} waiting for loader`}
              </p>
              <ul className="mt-3 space-y-1.5 text-xs text-zinc-600">
                {truck.orders.map((o) => (
                  <li key={o.orderId} className="flex gap-2">
                    <span>
                      {o.loadStatus === "loaded"
                        ? "✓"
                        : o.loadStatus === "load_skipped"
                          ? "✗"
                          : "○"}
                    </span>
                    <span>
                      {o.invoiceNumber}
                      {o.loadStatus === "load_skipped" && o.loadNotes
                        ? ` — ${o.loadNotes}`
                        : ""}
                      {o.loadStatus === "pending" ? " — waiting for loader" : ""}
                      {o.awaitingDepart ? " — ready to leave" : ""}
                    </span>
                  </li>
                ))}
              </ul>
              {!truck.canDepart && truck.hasFullyDeparted && (
                <p className="mt-3 text-sm font-medium text-green-700">
                  ✓ All loaded orders have left the warehouse
                </p>
              )}
              {truck.canDepart && (
                <Button
                  className="mt-4 w-full"
                  disabled={busyOrderId != null}
                  onClick={() => {
                    const firstAwaiting = truck.orders.find((o) => o.awaitingDepart);
                    if (firstAwaiting) {
                      submitProof(firstAwaiting.orderId, "departed");
                    }
                  }}
                >
                  Leave warehouse — {truck.awaitingDepartCount} order
                  {truck.awaitingDepartCount !== 1 ? "s" : ""} ready
                </Button>
              )}
              {!truck.canDepart && !truck.hasFullyDeparted && (
                <p className="mt-3 text-sm text-amber-800">
                  {truck.allResolved
                    ? "Nothing loaded on this truck — cannot depart"
                    : "Waiting for loader on all orders…"}
                </p>
              )}
            </Card>
          ))}

        <div>
          <h2 className="mb-2 text-sm font-semibold text-zinc-900">My orders</h2>
          {orders.length === 0 ? (
            <EmptyState title="No assigned orders right now." />
          ) : (
            <div className="space-y-3">
              {orders.map((order) => {
                const loaderPhases = loaderPhasesForOrder(order);
                const driverPhases = driverPhasesForOrder(order);

                return (
                  <Card key={order.id} className="overflow-hidden p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-zinc-900">
                          {order.invoiceNumber}
                        </p>
                        <p className="text-sm text-zinc-600">
                          {order.customerName}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {formatDeliverySchedule(order)}
                        </p>
                        {order.assignment && (
                          <p className="mt-1 text-xs text-zinc-500">
                            {order.assignment.vehicleName} (R
                            {order.assignment.deliveryRound})
                          </p>
                        )}
                      </div>
                      <Badge
                        tone={
                          order.loadStatus === "loaded"
                            ? "green"
                            : order.loadStatus === "load_skipped"
                              ? "red"
                              : statusTone[order.status] ?? "slate"
                        }
                      >
                        {order.deliveryStageLabel ??
                          order.status.replace(/_/g, " ")}
                      </Badge>
                    </div>

                    {order.loadStatus === "loaded" && !hasProof(order, "departed") && (
                      <p className="mt-2 text-xs font-medium text-green-700">
                        {isDriver
                          ? "✓ Loaded on truck — use “Leave warehouse” on the truck card above"
                          : "✓ Loaded on truck — waiting for driver"}
                      </p>
                    )}
                    {order.loadStatus === "pending" && order.assignment && (
                      <p className="mt-2 text-xs text-amber-700">
                        ○ Waiting for loader to confirm
                      </p>
                    )}

                    {order.loadStatus === "load_skipped" && (
                      <p className="mt-2 rounded bg-red-50 px-2 py-1.5 text-xs text-red-800">
                        Not loaded: {order.loadNotes ?? "—"}
                      </p>
                    )}

                    {(order.proofs ?? []).length > 0 && (
                      <ul className="mt-3 space-y-1 border-t border-zinc-100 pt-3 text-xs text-zinc-600">
                        {order.proofs!.map((p) => (
                          <li key={p.phase}>
                            ✓{" "}
                            {DELIVERY_PROOF_LABELS[p.phase as DeliveryProofPhase] ??
                              p.phase}
                            {p.notes ? ` — ${p.notes}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}

                    {isLoader && loaderPhases.length > 0 && (
                      <div className="mt-4 space-y-2 border-t border-zinc-100 pt-3">
                        <p className="text-xs font-medium text-zinc-700">
                          Loader — confirm this order
                        </p>
                        {loaderPhases
                          .filter((p) => p.id === "loaded")
                          .map((phase) => (
                            <div key={phase.id} className="rounded-lg border p-3">
                              <input
                                ref={(el) => {
                                  fileRefs.current[`${order.id}-${phase.id}`] =
                                    el;
                                }}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="mb-2 block w-full text-xs"
                              />
                              <Button
                                className="w-full"
                                disabled={busyOrderId === order.id}
                                onClick={() => submitProof(order.id, "loaded")}
                              >
                                Mark loaded on truck
                              </Button>
                            </div>
                          ))}
                        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                          <p className="text-sm font-medium text-zinc-900">
                            Cannot load this order?
                          </p>
                          <textarea
                            className="mt-2 w-full rounded border border-zinc-200 p-2 text-sm"
                            rows={2}
                            placeholder="Required: why it cannot be loaded…"
                            value={skipNotes[order.id] ?? ""}
                            onChange={(e) =>
                              setSkipNotes({
                                ...skipNotes,
                                [order.id]: e.target.value,
                              })
                            }
                          />
                          <Button
                            variant="secondary"
                            className="mt-2 w-full"
                            disabled={busyOrderId === order.id}
                            onClick={() =>
                              submitProof(
                                order.id,
                                "load_skipped",
                                skipNotes[order.id]
                              )
                            }
                          >
                            Confirm cannot load
                          </Button>
                        </div>
                      </div>
                    )}

                    {isDriver && order.loadStatus === "load_skipped" && (
                      <p className="mt-3 text-xs text-zinc-500">
                        This order is not on the truck — no delivery steps for you.
                      </p>
                    )}

                    {driverPhases.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {driverPhases.map((phase) => {
                          const done = hasProof(order, phase.id);
                          return (
                            <div
                              key={phase.id}
                              className={`rounded-lg border p-3 ${
                                done
                                  ? "border-green-200 bg-green-50"
                                  : "border-zinc-200"
                              }`}
                            >
                              {!done && (
                                <>
                                  <p className="text-sm font-medium">
                                    {phase.shortLabel}
                                  </p>
                                  <input
                                    ref={(el) => {
                                      fileRefs.current[`${order.id}-${phase.id}`] =
                                        el;
                                    }}
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    className="mt-2 block w-full text-xs"
                                  />
                                  <Button
                                    className="mt-2 w-full"
                                    disabled={busyOrderId === order.id}
                                    onClick={() =>
                                      submitProof(order.id, phase.id)
                                    }
                                  >
                                    {phase.photoRequired
                                      ? "Confirm with photo"
                                      : "Mark done"}
                                  </Button>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
