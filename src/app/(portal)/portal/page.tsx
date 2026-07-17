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
import {
  orderStatusLabelSq,
  proofLabelSq,
  sq,
  statusLabelSq,
  localizePortalError,
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
  shipment?: {
    ordered: { pallets: number; m2: number; pieces: number };
    sent: { pallets: number; m2: number; pieces: number };
    remaining: { pallets: number; m2: number; pieces: number };
    hasPartialShipments: boolean;
    isFullyDelivered: boolean;
  };
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
    sentPallets?: number | null;
    sentM2?: number | null;
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
    prepStatus?: "pending" | "prepared";
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
  const [refreshing, setRefreshing] = useState(false);
  const [skipNotes, setSkipNotes] = useState<Record<number, string>>({});
  const [skipOpen, setSkipOpen] = useState<Record<number, boolean>>({});
  const [detailsOpen, setDetailsOpen] = useState<Record<number, boolean>>({});
  const [statusOpen, setStatusOpen] = useState(false);
  const [partialOpen, setPartialOpen] = useState<Record<number, boolean>>({});
  const [partialPallets, setPartialPallets] = useState<Record<number, string>>(
    {}
  );
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/orders", { cache: "no-store" });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        setError(sq.errors.refresh);
        return;
      }
      const data = await res.json();
      setEmployee(data.employee ?? null);
      setMyStatus(data.employee?.status ?? "available");
      setOrders(data.orders ?? []);
      setTruckGroups(data.truckGroups ?? []);
      setNotifications(data.notifications ?? []);
    } catch {
      setError(sq.errors.refresh);
    }
  }, [router]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  async function refreshNow() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  async function setStatus(status: string) {
    setError("");
    const res = await fetch("/api/portal/me/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(localizePortalError(data.error) || sq.errors.status);
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
      setError(localizePortalError(data.error) || sq.errors.status);
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
    notes?: string,
    extras?: { sentPallets?: number; sentM2?: number; sentPieces?: number }
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

    if (phase === "partial_delivery") {
      const pallets = extras?.sentPallets;
      if (pallets == null || !Number.isFinite(pallets) || pallets <= 0) {
        setError(sq.errors.partialPallets);
        setBusyOrderId(null);
        return;
      }
    }

    const form = new FormData();
    form.set("phase", phase);
    if (file) form.set("photo", file);
    if (notes?.trim()) form.set("notes", notes.trim());
    if (extras?.sentPallets != null) {
      form.set("sentPallets", String(extras.sentPallets));
    }
    if (extras?.sentM2 != null) form.set("sentM2", String(extras.sentM2));
    if (extras?.sentPieces != null) {
      form.set("sentPieces", String(extras.sentPieces));
    }

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
      } else if (String(msg).toLowerCase().includes("not assigned")) {
        setError(sq.errors.notAssigned);
      } else {
        setError(localizePortalError(msg));
      }
      return;
    }

    if (data.warning) {
      setSuccess(`${proofLabelSq(phase)} — ${sq.successSaved} (${data.warning})`);
    } else if (phase === "partial_delivery") {
      setSuccess(sq.successPartialDelivery);
    } else if (phase === "prepared") {
      setSuccess(sq.successPrepared);
    } else if (phase === "loaded") {
      setSuccess(sq.successLoaded);
    } else {
      setSuccess(
        phase === "departed"
          ? sq.successDeparted
          : `${proofLabelSq(phase)} — ${sq.successSaved}`
      );
    }
    if (input) input.value = "";
    setPartialOpen((prev) => ({ ...prev, [orderId]: false }));
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

  function loaderNeedsAction(order: PortalOrder) {
    if (!isLoader) return false;
    return order.loadStatus !== "loaded" && order.loadStatus !== "load_skipped";
  }

  function driverPhasesForOrder(order: PortalOrder) {
    if (!isDriver) return [];
    if (order.loadStatus !== "loaded") return [];
    if (!hasProof(order, "departed")) return [];
    if (hasProof(order, "delivered")) return [];
    if (!hasProof(order, "arrived")) {
      return DELIVERY_PROOF_PHASES.filter((p) => p.id === "arrived");
    }
    return DELIVERY_PROOF_PHASES.filter((p) => p.id === "delivered");
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
      onRefresh={refreshNow}
      refreshing={refreshing}
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
        <button
          type="button"
          className="flex w-full items-center justify-between text-left"
          onClick={() => setStatusOpen((v) => !v)}
        >
          <span className="text-sm font-semibold text-zinc-700">
            {sq.showStatus}: {statusLabelSq(myStatus)}
          </span>
          <span className="text-xs text-zinc-400">{statusOpen ? "▴" : "▾"}</span>
        </button>
        {statusOpen && (
          <div className="mt-3 grid grid-cols-2 gap-2">
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
        )}
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
                          : o.prepStatus === "prepared"
                            ? "◐"
                            : "○"}
                    </span>
                    <span>
                      {o.invoiceNumber}
                      {o.loadStatus === "load_skipped" && o.loadNotes
                        ? ` — ${o.loadNotes}`
                        : ""}
                      {o.loadStatus === "pending"
                        ? o.prepStatus === "prepared"
                          ? ` — ${sq.waitingLoadOnTruck}`
                          : ` — ${sq.waitingLoader}`
                        : ""}
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
                const needsLoad = loaderNeedsAction(order);
                const driverPhases = driverPhasesForOrder(order);
                const showDetails = Boolean(detailsOpen[order.id]);
                const showSkip = Boolean(skipOpen[order.id]);
                const truckLine = order.assignment
                  ? sq.truckRound(
                      order.assignment.vehicleName,
                      order.assignment.deliveryRound
                    )
                  : null;

                return (
                  <PortalCard key={order.id} className="overflow-hidden">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-lg font-bold tracking-tight text-zinc-900">
                          {order.invoiceNumber}
                        </p>
                        <p className="mt-0.5 truncate text-sm text-zinc-600">
                          {order.customerName}
                        </p>
                        {truckLine && (
                          <p className="mt-2 text-sm font-medium text-zinc-800">
                            {truckLine}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-zinc-500">
                          {order.shipment?.hasPartialShipments
                            ? sq.deliveryRemaining(
                                order.shipment.sent.pallets,
                                order.shipment.remaining.pallets
                              )
                            : sq.palletsShort(
                                order.shipment?.remaining.pallets ??
                                  order.totalPallets
                              )}
                          {" · "}
                          {formatDeliverySchedule(order)}
                        </p>
                      </div>
                      <Badge
                        tone={
                          order.loadStatus === "loaded"
                            ? "green"
                            : order.loadStatus === "load_skipped"
                              ? "red"
                              : order.prepStatus === "prepared"
                                ? "blue"
                              : order.status === "partially_delivered"
                                ? "amber"
                                : statusTone[order.status] ?? "slate"
                        }
                      >
                        {order.loadStatus === "loaded"
                          ? sq.proof.loaded
                          : order.loadStatus === "load_skipped"
                            ? sq.proof.load_skipped
                            : order.prepStatus === "prepared"
                              ? sq.proof.prepared
                              : order.deliveryStageLabel ??
                                orderStatusLabelSq(order.status)}
                      </Badge>
                    </div>

                    {order.shipment?.hasPartialShipments && (
                      <p className="mt-3 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-900">
                        {sq.deliveryOrdered(order.shipment.ordered.pallets)}
                        {" · "}
                        {sq.deliveryRemaining(
                          order.shipment.sent.pallets,
                          order.shipment.remaining.pallets
                        )}
                      </p>
                    )}

                    {order.loadStatus === "load_skipped" && (
                      <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                        {sq.notLoadedPrefix} {order.loadNotes ?? "—"}
                      </p>
                    )}

                    {order.loadStatus === "loaded" && isLoader && (
                      <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
                        {sq.loadedOnTruckPicker}
                      </p>
                    )}

                    {isLoader &&
                      order.prepStatus === "prepared" &&
                      order.loadStatus === "pending" && (
                      <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
                        {sq.preparedWaitingLoad}
                      </p>
                    )}

                    {driverOrderIsInfoOnly(order) && (
                      <p className="mt-3 rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-700">
                        {order.loadStatus === "load_skipped"
                          ? sq.notOnTruck
                          : order.prepStatus === "prepared"
                            ? sq.driverWaitingPrepared
                            : sq.driverWaitingLoad}
                      </p>
                    )}

                    {needsLoad && (
                      <div className="mt-4 space-y-2">
                        {order.loadBlockedReason && (
                          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                            {localizePortalError(order.loadBlockedReason)}
                          </p>
                        )}

                        {order.prepStatus !== "prepared" ? (
                          <Button
                            className="w-full py-3 text-base"
                            disabled={busyOrderId === order.id}
                            onClick={() => submitProof(order.id, "prepared")}
                          >
                            {sq.markPrepared}
                          </Button>
                        ) : (
                          <>
                            <Button
                              className="w-full py-3 text-base"
                              disabled={
                                busyOrderId === order.id ||
                                order.canMarkLoaded === false
                              }
                              onClick={() => submitProof(order.id, "loaded")}
                            >
                              {sq.markLoaded}
                            </Button>

                            {!showSkip ? (
                              <button
                                type="button"
                                className="w-full py-2 text-center text-sm font-medium text-amber-800 underline-offset-2 hover:underline"
                                onClick={() =>
                                  setSkipOpen({ ...skipOpen, [order.id]: true })
                                }
                              >
                                {sq.cannotLoadProblem}
                              </button>
                            ) : (
                              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
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
                                  onClick={() => {
                                    if (!confirm(sq.confirmCannotLoadAsk)) {
                                      return;
                                    }
                                    void submitProof(
                                      order.id,
                                      "load_skipped",
                                      skipNotes[order.id]
                                    );
                                  }}
                                >
                                  {sq.confirmCannotLoad}
                                </Button>
                                <button
                                  type="button"
                                  className="mt-2 w-full text-center text-xs text-zinc-500"
                                  onClick={() =>
                                    setSkipOpen({
                                      ...skipOpen,
                                      [order.id]: false,
                                    })
                                  }
                                >
                                  {sq.hideDetails}
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {driverPhases.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {driverPhases.map((phase) => {
                          if (phase.id === "delivered") {
                            const remaining =
                              order.shipment?.remaining.pallets ??
                              order.totalPallets;
                            const showPartial = Boolean(partialOpen[order.id]);
                            return (
                              <div
                                key="delivery-choice"
                                className="rounded-lg border border-zinc-200 p-3"
                              >
                                <p className="text-sm font-medium text-zinc-900">
                                  {sq.driverDeliveredPhoto}
                                </p>
                                <p className="mt-1 text-xs text-zinc-500">
                                  {sq.deliveryOrdered(
                                    order.shipment?.ordered.pallets ??
                                      order.totalPallets
                                  )}
                                  {" · "}
                                  {sq.palletsShort(remaining)} mbeten
                                </p>
                                <input
                                  ref={(el) => {
                                    fileRefs.current[
                                      `${order.id}-delivered`
                                    ] = el;
                                    fileRefs.current[
                                      `${order.id}-partial_delivery`
                                    ] = el;
                                  }}
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  className="mt-2 block w-full text-xs"
                                />
                                <Button
                                  className="mt-2 w-full py-3"
                                  disabled={busyOrderId === order.id}
                                  onClick={() =>
                                    submitProof(order.id, "delivered")
                                  }
                                >
                                  {sq.deliveryFull}
                                </Button>
                                {!showPartial ? (
                                  <button
                                    type="button"
                                    className="mt-2 w-full py-2 text-center text-sm font-medium text-orange-800 underline-offset-2 hover:underline"
                                    onClick={() =>
                                      setPartialOpen({
                                        ...partialOpen,
                                        [order.id]: true,
                                      })
                                    }
                                  >
                                    {sq.deliveryPartial}
                                  </button>
                                ) : (
                                  <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50/70 p-3">
                                    <p className="text-sm font-medium text-zinc-900">
                                      {sq.deliveryPartialHint}
                                    </p>
                                    <label className="mt-2 block text-xs text-zinc-600">
                                      {sq.deliveryPartialPallets}
                                      <input
                                        type="number"
                                        min={0.1}
                                        step={0.1}
                                        max={remaining}
                                        className="mt-1 w-full rounded border border-zinc-200 px-2 py-2 text-sm"
                                        value={partialPallets[order.id] ?? ""}
                                        onChange={(e) =>
                                          setPartialPallets({
                                            ...partialPallets,
                                            [order.id]: e.target.value,
                                          })
                                        }
                                        placeholder={`max ${remaining}`}
                                      />
                                    </label>
                                    <Button
                                      className="mt-2 w-full py-3"
                                      disabled={busyOrderId === order.id}
                                      onClick={() =>
                                        submitProof(
                                          order.id,
                                          "partial_delivery",
                                          undefined,
                                          {
                                            sentPallets: Number(
                                              partialPallets[order.id]
                                            ),
                                          }
                                        )
                                      }
                                    >
                                      {sq.deliveryPartialConfirm}
                                    </Button>
                                    <button
                                      type="button"
                                      className="mt-2 w-full text-center text-xs text-zinc-500"
                                      onClick={() =>
                                        setPartialOpen({
                                          ...partialOpen,
                                          [order.id]: false,
                                        })
                                      }
                                    >
                                      {sq.hideDetails}
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          }

                          return (
                            <div
                              key={phase.id}
                              className="rounded-lg border border-zinc-200 p-3"
                            >
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
                                className="mt-2 w-full py-3"
                                disabled={busyOrderId === order.id}
                                onClick={() =>
                                  submitProof(order.id, phase.id)
                                }
                              >
                                {phase.photoRequired
                                  ? sq.confirmWithPhoto
                                  : sq.driverMarkDone}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {(order.proofs ?? []).length > 0 && (
                      <div className="mt-3 border-t border-zinc-100 pt-2">
                        <button
                          type="button"
                          className="text-xs font-medium text-zinc-500"
                          onClick={() =>
                            setDetailsOpen({
                              ...detailsOpen,
                              [order.id]: !showDetails,
                            })
                          }
                        >
                          {showDetails ? sq.hideDetails : sq.showDetails}
                        </button>
                        {showDetails && (
                          <ul className="mt-2 space-y-1 text-xs text-zinc-600">
                            {order.proofs!.map((p, idx) => (
                              <li key={`${p.phase}-${p.capturedAt}-${idx}`}>
                                ✓ {proofLabelSq(p.phase)}
                                {p.sentPallets != null
                                  ? ` — ${p.sentPallets} plt`
                                  : ""}
                                {p.notes ? ` — ${p.notes}` : ""}
                              </li>
                            ))}
                          </ul>
                        )}
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
