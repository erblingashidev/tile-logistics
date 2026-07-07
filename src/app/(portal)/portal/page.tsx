"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  EmptyState,
  Alert,
} from "@/components/ui";
import {
  PortalCard,
  PortalSectionTitle,
  PortalShell,
} from "@/components/portal/PortalShell";
import {
  DELIVERY_PROOF_PHASES,
  EMPLOYEE_STATUSES,
  type DeliveryProofPhase,
  type EmployeeRole,
} from "@/lib/constants";
import { WAREHOUSE_REPORT_ROLES } from "@/lib/employee-categories";
import { BRAND } from "@/lib/brand";
import {
  orderStatusLabelSq,
  proofLabelSq,
  sq,
  statusLabelSq,
} from "@/lib/i18n/sq";
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
  prepStatus?: "pending" | "prepared";
  canMarkLoaded?: boolean;
  loadBlockedReason?: string | null;
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
  vehicleStatus?: string | null;
}

interface PortalNotification {
  id: number;
  type: string;
  vehicleId: number | null;
  deliveryRound: number | null;
  message: string;
  createdAt: string;
}

const statusTone: Record<string, "green" | "amber" | "blue" | "red" | "slate"> =
  {
    available: "green",
    busy: "blue",
    on_break: "amber",
    off_duty: "slate",
    returning: "amber",
    pending: "amber",
    assigned: "blue",
    in_transit: "blue",
    delivered: "green",
    cancelled: "red",
  };

function hasProof(order: PortalOrder, phase: string) {
  return (order.proofs ?? []).some((p) => p.phase === phase);
}

function driverPhaseLabel(phase: DeliveryProofPhase): string {
  if (phase === "arrived") return sq.driverArrived;
  if (phase === "delivered") return sq.driverDeliveredPhoto;
  return proofLabelSq(phase);
}

export default function PortalPage() {
  const router = useRouter();
  const [employee, setEmployee] = useState<PortalEmployee | null>(null);
  const [myStatus, setMyStatus] = useState("available");
  const [orders, setOrders] = useState<PortalOrder[]>([]);
  const [truckGroups, setTruckGroups] = useState<TruckLoadGroup[]>([]);
  const [notifications, setNotifications] = useState<PortalNotification[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busyOrderId, setBusyOrderId] = useState<number | null>(null);
  const [busyArriving, setBusyArriving] = useState(false);
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
    setNotifications(data.notifications ?? []);
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
      setError(data.error ?? sq.errors.status);
      return;
    }
    setMyStatus(status);
    setSuccess(sq.statusUpdated);
    setTimeout(() => setSuccess(""), 2000);
  }

  async function confirmTruckArrived() {
    setError("");
    setSuccess("");
    setBusyArriving(true);
    const res = await fetch("/api/portal/truck/arrived", { method: "POST" });
    const data = await res.json();
    setBusyArriving(false);
    if (!res.ok) {
      setError(data.error ?? sq.errors.status);
      return;
    }
    setSuccess(sq.truckArrivedSuccess);
    setTimeout(() => setSuccess(""), 4000);
    load();
  }

  async function dismissNotification(notificationId: number) {
    await fetch(`/api/portal/notifications/${notificationId}/read`, {
      method: "POST",
    });
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
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
      setError(sq.errors.photoRequired);
      setBusyOrderId(null);
      return;
    }

    if (phaseDef?.notesRequired && !notes?.trim()) {
      setError(sq.errors.notesRequired);
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
      const msg = data.error ?? sq.errors.proofFailed;
      if (res.status === 401) {
        setError(sq.errors.unauthorized);
      } else if (res.status === 403) {
        setError(sq.errors.forbidden);
      } else if (msg.includes("not assigned")) {
        setError(sq.errors.notAssigned);
      } else {
        setError(msg);
      }
      return;
    }

    if (data.warning) {
      setSuccess(`${proofLabelSq(phase)} — ${sq.successSaved} (${data.warning})`);
    } else {
      setSuccess(
        phase === "departed"
          ? sq.successDeparted
          : `${proofLabelSq(phase)} — ${sq.successSaved}`
      );
    }
    if (input) input.value = "";
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
  const showWmsLink =
    employee?.roles.some((r) =>
      (["warehouse_admin", "warehouse_reporter", "group_leader", "picker", "unloader", "maintainer"] as EmployeeRole[]).includes(r)
    ) ?? false;
  const showReportsLink =
    employee?.roles.some((r) => WAREHOUSE_REPORT_ROLES.includes(r)) ?? false;

  function loaderPhasesForOrder(order: PortalOrder) {
    if (!isLoader) return [];
    if (order.loadStatus === "loaded" || order.loadStatus === "load_skipped") {
      return [];
    }
    if (order.prepStatus !== "prepared") {
      return DELIVERY_PROOF_PHASES.filter((p) => p.id === "prepared");
    }
    return DELIVERY_PROOF_PHASES.filter(
      (p) => p.id === "loaded" || p.id === "load_skipped"
    );
  }

  function driverPhasesForOrder(order: PortalOrder) {
    if (!isDriver) return [];
    if (order.loadStatus !== "loaded") return [];
    if (!hasProof(order, "departed")) return [];
    return DELIVERY_PROOF_PHASES.filter(
      (p) => p.id === "arrived" || p.id === "delivered"
    );
  }

  function driverOrderIsInfoOnly(order: PortalOrder) {
    return isDriver && order.loadStatus !== "loaded";
  }

  return (
    <PortalShell
      title={sq.appName}
      subtitle={employee?.name}
      activeNav="orders"
      showOrders
      showWms={showWmsLink}
      showReports={showReportsLink}
      onLogout={logout}
    >
      {error && <Alert tone="error">{error}</Alert>}
      {success && <Alert tone="info">{success}</Alert>}

      {notifications.map((notification) => (
        <Alert key={notification.id} tone="warning">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <p className="text-sm leading-relaxed">{notification.message}</p>
            <Button
              type="button"
              variant="secondary"
              className="shrink-0"
              onClick={() => dismissNotification(notification.id)}
            >
              {sq.notificationDismiss}
            </Button>
          </div>
        </Alert>
      ))}

      {isDriver && employee?.vehicleStatus === "returning" && (
        <PortalCard className="border-amber-200 bg-amber-50/80">
          <p className="text-sm text-amber-950">{sq.allDeliveredReturn}</p>
          <Button
            className="mt-4 w-full"
            disabled={busyArriving}
            onClick={confirmTruckArrived}
          >
            {sq.truckArrivedButton}
          </Button>
        </PortalCard>
      )}

      <PortalCard>
        <PortalSectionTitle className="mb-3 normal-case tracking-normal text-zinc-700">
          {sq.myStatus}
        </PortalSectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {EMPLOYEE_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                myStatus === s
                  ? "bg-zinc-900 text-white shadow-sm"
                  : "border border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-300"
              }`}
            >
              {statusLabelSq(s)}
            </button>
          ))}
        </div>
      </PortalCard>

      {isDriver &&
        truckGroups.map((truck) => {
          const isActiveRound = truck.canDepart || truck.hasFullyDeparted;
          return (
          <PortalCard
            key={`${truck.vehicleId}-${truck.deliveryRound}`}
            className={!isActiveRound ? "border-zinc-200 bg-zinc-50/60" : undefined}
          >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-zinc-900">
                  {truck.vehicleName} ({truck.plateNumber}) ·{" "}
                  {sq.roundLabel(truck.deliveryRound)}
                </p>
                {!isActiveRound && (
                  <Badge tone="slate">{sq.driverInfoOnly}</Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-zinc-600">
                {sq.loadingLine(
                  truck.resolvedCount,
                  truck.totalOrders,
                  truck.pendingCount
                )}
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
                      {o.loadStatus === "pending" ? ` — ${sq.waitingLoader}` : ""}
                      {o.awaitingDepart ? ` — ${sq.readyToLeave}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              {!isActiveRound && (
                <p className="mt-3 text-sm text-zinc-600">
                  {sq.driverWaitingLoad}
                </p>
              )}
              {isActiveRound && !truck.canDepart && truck.hasFullyDeparted && (
                <p className="mt-3 text-sm font-medium text-green-700">
                  {sq.allLeft}
                </p>
              )}
              {isActiveRound && truck.canDepart && (
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
                  {sq.leaveWarehouse(truck.awaitingDepartCount)}
                </Button>
              )}
              {isActiveRound && !truck.canDepart && !truck.hasFullyDeparted && (
                <p className="mt-3 text-sm text-amber-800">
                  {truck.allResolved
                    ? sq.cannotDepartEmpty
                    : sq.waitingAllLoaders}
                </p>
              )}
            </PortalCard>
          );
        })}

        <section>
          <PortalSectionTitle className="mb-3">{sq.myOrders}</PortalSectionTitle>
          {orders.length === 0 ? (
            <PortalCard>
              <EmptyState title={sq.nothingToDo} />
            </PortalCard>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => {
                const loaderPhases = loaderPhasesForOrder(order);
                const driverPhases = driverPhasesForOrder(order);

                return (
                  <PortalCard key={order.id} className="overflow-hidden">
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
                          orderStatusLabelSq(order.status)}
                      </Badge>
                    </div>

                    {order.loadStatus === "load_skipped" && (
                      <p className="mt-2 rounded bg-red-50 px-2 py-1.5 text-xs text-red-800">
                        {sq.notLoadedPrefix} {order.loadNotes ?? "—"}
                      </p>
                    )}

                    {driverOrderIsInfoOnly(order) && (
                      <p className="mt-2 rounded bg-zinc-100 px-2 py-1.5 text-xs text-zinc-700">
                        {order.prepStatus === "prepared"
                          ? sq.loadedOnTruckPicker
                          : sq.driverWaitingLoad}
                      </p>
                    )}

                    {(order.proofs ?? []).length > 0 && (
                      <ul className="mt-3 space-y-1 border-t border-zinc-100 pt-3 text-xs text-zinc-600">
                        {order.proofs!.map((p) => (
                          <li key={p.phase}>
                            ✓ {proofLabelSq(p.phase)}
                            {p.notes ? ` — ${p.notes}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}

                    {isLoader && loaderPhases.length > 0 && (
                      <div className="mt-4 space-y-2 border-t border-zinc-100 pt-3">
                        {loaderPhases.some((p) => p.id === "prepared") && (
                          <div className="rounded-lg border p-3">
                            <p className="mb-2 text-xs font-medium text-zinc-700">
                              {sq.loaderStepPrepare}
                            </p>
                            <Button
                              className="w-full"
                              disabled={busyOrderId === order.id}
                              onClick={() => submitProof(order.id, "prepared")}
                            >
                              {sq.markPrepared}
                            </Button>
                          </div>
                        )}
                        {loaderPhases.some((p) => p.id === "loaded") && (
                          <>
                            <div className="rounded-lg border p-3">
                              <p className="mb-2 text-xs font-medium text-zinc-700">
                                {sq.loaderStepLoad}
                              </p>
                              {order.loadBlockedReason && (
                                <p className="mb-2 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                                  {order.loadBlockedReason}
                                </p>
                              )}
                              <Button
                                className="w-full"
                                disabled={
                                  busyOrderId === order.id ||
                                  order.canMarkLoaded === false
                                }
                                onClick={() => submitProof(order.id, "loaded")}
                              >
                                {sq.markLoaded}
                              </Button>
                            </div>
                            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                              <p className="text-sm font-medium text-zinc-900">
                                {sq.cannotLoadTitle}
                              </p>
                              <textarea
                                className="mt-2 w-full rounded border border-zinc-200 p-2 text-sm"
                                rows={2}
                                placeholder={sq.cannotLoadPlaceholder}
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
                                {sq.confirmCannotLoad}
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
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
                                    {driverPhaseLabel(phase.id)}
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
                                      ? sq.confirmWithPhoto
                                      : sq.driverMarkDone}
                                  </Button>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </PortalCard>
                );
              })}
            </div>
          )}
        </section>
    </PortalShell>
  );
}
