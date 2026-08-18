"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Badge, Card, Input } from "@/components/ui";
import { formatDeliveryRound } from "@/lib/delivery-rounds";
import { useFeatureFlags } from "@/components/features/FeatureFlagsProvider";
import { truckColorForVehicle } from "@/lib/dispatch/truck-colors";
import { groupOrdersByRegion } from "@/lib/orders/group-by-region";
import type {
  DispatchBoardOrder,
  DispatchBoardRound,
  DispatchBoardTruck,
} from "@/lib/services/dispatch-board";

const DRAG_MIME = "application/x-tile-order-id";

interface DropTarget {
  vehicleId: number;
  deliveryRound: number;
}

interface DispatchAssignBoardProps {
  unassignedOrders: DispatchBoardOrder[];
  trucks: DispatchBoardTruck[];
  onAssigned: () => void;
  onError: (message: string) => void;
  onMessage: (message: string) => void;
}

function roundTone(status: string) {
  if (status === "ready") return "green" as const;
  if (status === "departed") return "blue" as const;
  if (status === "loading") return "amber" as const;
  return "slate" as const;
}

function dropZoneKey(target: DropTarget) {
  return `${target.vehicleId}-${target.deliveryRound}`;
}

function canAcceptDrop(
  round: DispatchBoardRound,
  order: DispatchBoardOrder | undefined
): { ok: boolean; reason?: string } {
  if (round.status === "departed") {
    return { ok: false, reason: "Round already departed" };
  }
  if (order && round.totalPallets + order.totalPallets > round.maxPallets) {
    return { ok: false, reason: "Round at pallet capacity" };
  }
  return { ok: true };
}

export function DispatchAssignBoard({
  unassignedOrders,
  trucks,
  onAssigned,
  onError,
  onMessage,
}: DispatchAssignBoardProps) {
  const { deliveryRounds } = useFeatureFlags();
  const [search, setSearch] = useState("");
  const [draggingOrderId, setDraggingOrderId] = useState<number | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [activeDrop, setActiveDrop] = useState<string | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<number | null>(null);
  const [busyDrop, setBusyDrop] = useState<string | null>(null);
  const didDragRef = useRef(false);

  const draggingOrder = useMemo(
    () => unassignedOrders.find((o) => o.id === draggingOrderId),
    [draggingOrderId, unassignedOrders]
  );
  const selectedOrder = useMemo(
    () => unassignedOrders.find((o) => o.id === selectedOrderId),
    [selectedOrderId, unassignedOrders]
  );
  const activeOrder = draggingOrder ?? selectedOrder;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedOrderId(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (
      selectedOrderId != null &&
      !unassignedOrders.some((o) => o.id === selectedOrderId)
    ) {
      setSelectedOrderId(null);
    }
  }, [selectedOrderId, unassignedOrders]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return unassignedOrders;
    return unassignedOrders.filter((o) => {
      const haystack = [
        o.invoiceNumber,
        o.customerName,
        o.location,
        o.city,
        o.region,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [search, unassignedOrders]);

  const orderGroups = useMemo(
    () => groupOrdersByRegion(filteredOrders),
    [filteredOrders]
  );

  async function assignOrder(
    orderId: number,
    vehicleId: number,
    deliveryRound: number,
    ignoreWeightWarning = false,
    ignoreCraneRule = false,
    ignoreLinkedWarning = false
  ) {
    const truck = trucks.find((t) => t.vehicleId === vehicleId);
    const dropKey = dropZoneKey({ vehicleId, deliveryRound });

    setBusyOrderId(orderId);
    setBusyDrop(dropKey);
    onError("");

    try {
      const res = await fetch("/api/orders/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: [orderId],
          vehicleId,
          deliveryRound,
          preservePicker: true,
          ignoreWeightWarning,
          ignoreCraneRule,
          ignoreLinkedWarning,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 422 && data.isLinkedWarning) {
        if (confirm(`${data.error ?? "Linked delivery conflict"}\n\nProceed?`)) {
          await assignOrder(
            orderId,
            vehicleId,
            deliveryRound,
            ignoreWeightWarning,
            ignoreCraneRule,
            true
          );
        }
        return;
      }

      if (res.status === 422 && data.results) {
        const errMsg =
          data.results.find((r: { error?: string }) => r.error)?.error ??
          data.error ??
          "Weight limit exceeded";
        if (confirm(`${errMsg}\n\nProceed?`)) {
          await assignOrder(
            orderId,
            vehicleId,
            deliveryRound,
            true,
            ignoreCraneRule,
            ignoreLinkedWarning
          );
        }
        return;
      }

      if (!res.ok) {
        onError(data.error ?? "Could not assign order");
        return;
      }

      const vehicleName =
        data.vehicleName ?? truck?.name ?? `Truck ${vehicleId}`;
      onMessage(
        `Assigned to ${vehicleName}${
          deliveryRounds
            ? ` · ${formatDeliveryRound(deliveryRound, "compact")}`
            : ""
        }`
      );
      setTimeout(() => onMessage(""), 4000);
      setSelectedOrderId(null);
      onAssigned();
    } catch {
      onError("Could not assign order");
    } finally {
      setBusyOrderId(null);
      setBusyDrop(null);
    }
  }

  function handleDrop(
    e: React.DragEvent,
    vehicleId: number,
    deliveryRound: number,
    round: DispatchBoardRound
  ) {
    e.preventDefault();
    setActiveDrop(null);

    const raw = e.dataTransfer.getData(DRAG_MIME);
    const orderId = Number(raw);
    if (!orderId) return;

    const order = unassignedOrders.find((o) => o.id === orderId);
    const acceptance = canAcceptDrop(round, order);
    if (!acceptance.ok) {
      onError(acceptance.reason ?? "Cannot drop here");
      return;
    }

    void assignOrder(orderId, vehicleId, deliveryRound);
  }

  function handleLoadClick(
    vehicleId: number,
    deliveryRound: number,
    round: DispatchBoardRound
  ) {
    if (!selectedOrder) return;
    const acceptance = canAcceptDrop(round, selectedOrder);
    if (!acceptance.ok) {
      onError(acceptance.reason ?? "Cannot assign here");
      return;
    }
    void assignOrder(selectedOrder.id, vehicleId, deliveryRound);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-zinc-900">
              Unassigned orders
            </p>
            <p className="text-xs text-zinc-500">
              {selectedOrder
                ? `${selectedOrder.invoiceNumber} selected — tap a truck to assign, or drag.`
                : "Select an order, then tap a truck — or drag onto a load."}
              {selectedOrder && (
                <>
                  {" "}
                  <button
                    type="button"
                    className="text-blue-600 underline"
                    onClick={() => setSelectedOrderId(null)}
                  >
                    Clear
                  </button>
                </>
              )}
            </p>
          </div>
          <Input
            label="Filter"
            placeholder="Invoice, city, customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-xs"
          />
        </div>

        {filteredOrders.length === 0 ? (
          <Card className="p-6 text-sm text-zinc-500">
            {unassignedOrders.length === 0
              ? "No ready unassigned orders."
              : "No orders match your filter."}
          </Card>
        ) : (
          <div className="space-y-5">
            {orderGroups.map(({ region, orders: regionOrders }) => {
              const palletTotal = regionOrders.reduce(
                (sum, o) => sum + o.totalPallets,
                0
              );

              return (
                <section
                  key={region}
                  className="overflow-hidden rounded-xl border border-zinc-200 bg-white"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-100/90 px-3 py-2.5">
                    <div>
                      <h3 className="font-semibold text-zinc-900">{region}</h3>
                      <p className="text-xs text-zinc-500">
                        {regionOrders.length} order
                        {regionOrders.length === 1 ? "" : "s"} · {palletTotal}{" "}
                        plt total
                      </p>
                    </div>
                  </div>

                  <div className="divide-y divide-zinc-100">
                    {regionOrders.map((order) => {
              const isDragging = draggingOrderId === order.id;
              const isSelected = selectedOrderId === order.id;
              const isBusy = busyOrderId === order.id;

              return (
                <div
                  key={order.id}
                  role="button"
                  tabIndex={0}
                  draggable={!isBusy}
                  onClick={() => {
                    if (didDragRef.current) {
                      didDragRef.current = false;
                      return;
                    }
                    if (isBusy) return;
                    setSelectedOrderId(isSelected ? null : order.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (isBusy) return;
                      setSelectedOrderId(isSelected ? null : order.id);
                    }
                  }}
                  onDragStart={(e) => {
                    didDragRef.current = true;
                    e.dataTransfer.setData(DRAG_MIME, String(order.id));
                    e.dataTransfer.effectAllowed = "move";
                    setDraggingOrderId(order.id);
                    setSelectedOrderId(order.id);
                  }}
                  onDragEnd={() => {
                    setDraggingOrderId(null);
                    setActiveDrop(null);
                  }}
                  className={`cursor-pointer border-l-4 border-zinc-200 bg-white p-3 transition active:cursor-grabbing ${
                    isDragging ? "opacity-50" : ""
                  } ${isBusy ? "opacity-60" : "hover:bg-zinc-50/80"} ${
                    isSelected
                      ? "bg-blue-50 ring-2 ring-inset ring-blue-500"
                      : ""
                  }`}
                  style={{ borderLeftColor: order.priority === "urgent" ? "#dc2626" : isSelected ? "#2563eb" : "#71717a" }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-zinc-900">
                        {order.invoiceNumber}
                        {order.priority === "urgent" && (
                          <span className="ml-2">
                            <Badge tone="red">URGENT</Badge>
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-zinc-700">{order.customerName}</p>
                      <p className="mt-1 text-sm text-zinc-600">{order.location}</p>
                      {(order.city || order.region) && (
                        <p className="text-xs text-zinc-500">
                          {[order.city, order.region].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    <div className="text-right text-xs text-zinc-600">
                      <p className="font-medium text-zinc-800">
                        {order.totalPallets} plt
                      </p>
                      {order.totalWeightKg > 0 && (
                        <p>{Math.round(order.totalWeightKg)} kg</p>
                      )}
                      {order.pickerName && (
                        <p className="mt-1 text-zinc-500">Picker: {order.pickerName}</p>
                      )}
                      {isSelected && !isBusy && (
                        <p className="mt-1 font-medium text-blue-600">Selected</p>
                      )}
                      {isBusy && (
                        <p className="mt-1 font-medium text-blue-600">Assigning…</p>
                      )}
                    </div>
                  </div>
                </div>
              );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <aside className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
        <p className="text-sm font-medium text-zinc-900">
          {deliveryRounds ? "Trucks & rounds" : "Trucks"}
        </p>

        {trucks.length === 0 ? (
          <Card className="p-4 text-sm text-zinc-500">No trucks available.</Card>
        ) : (
          trucks.map((truck) => {
            const accent = truckColorForVehicle(truck.vehicleId);

            return (
              <div
                key={truck.vehicleId}
                className="overflow-hidden rounded border border-zinc-200 bg-white border-l-4"
                style={{ borderLeftColor: accent }}
              >
                <div className="border-b border-zinc-100 bg-zinc-50 px-3 py-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900">
                        {truck.name}{" "}
                        <span className="font-normal text-zinc-500">
                          ({truck.plateNumber})
                        </span>
                      </p>
                      <p className="text-xs text-zinc-500">
                        {truck.driverName
                          ? `Driver: ${truck.driverName}`
                          : "No driver linked"}{" "}
                        · max {truck.maxPallets} plt
                      </p>
                    </div>
                    <Link
                      href={`/orders?vehicleId=${truck.vehicleId}`}
                      className="text-xs text-blue-600 underline"
                    >
                      Orders
                    </Link>
                  </div>
                </div>

                <div className="divide-y divide-zinc-100">
                  {truck.rounds.map((round) => {
                    const target = {
                      vehicleId: truck.vehicleId,
                      deliveryRound: round.round,
                    };
                    const key = dropZoneKey(target);
                    const acceptance = canAcceptDrop(round, activeOrder);
                    const isActive = activeDrop === key;
                    const isBusy = busyDrop === key;
                    const isDisabled = Boolean(activeOrder) && !acceptance.ok;
                    const clickReady = Boolean(selectedOrder) && !draggingOrder && !isDisabled;

                    return (
                      <div
                        key={round.round}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (draggingOrder) return;
                          handleLoadClick(truck.vehicleId, round.round, round);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleLoadClick(truck.vehicleId, round.round, round);
                          }
                        }}
                        onDragOver={(e) => {
                          if (isDisabled && !draggingOrder) return;
                          e.preventDefault();
                          if (isDisabled) {
                            e.dataTransfer.dropEffect = "none";
                            return;
                          }
                          e.dataTransfer.dropEffect = "move";
                          setActiveDrop(key);
                        }}
                        onDragLeave={() => {
                          if (activeDrop === key) setActiveDrop(null);
                        }}
                        onDrop={(e) => {
                          if (isDisabled) {
                            onError(acceptance.reason ?? "Cannot drop here");
                            return;
                          }
                          handleDrop(e, truck.vehicleId, round.round, round);
                        }}
                        className={`p-3 transition ${
                          clickReady ? "cursor-pointer" : ""
                        } ${
                          (isActive || clickReady) && !isDisabled
                            ? "bg-blue-50 ring-2 ring-inset ring-blue-400"
                            : isDisabled && activeOrder
                              ? "bg-zinc-50 opacity-60"
                              : selectedOrder
                                ? "hover:bg-zinc-50"
                                : ""
                        } ${isBusy ? "opacity-70" : ""}`}
                        title={
                          isDisabled
                            ? acceptance.reason
                            : selectedOrder
                              ? "Click to assign selected order"
                              : undefined
                        }
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-zinc-900">
                            {deliveryRounds
                              ? formatDeliveryRound(round.round, "short")
                              : "Load"}
                          </p>
                          <Badge tone={roundTone(round.status)}>
                            {round.statusLabel}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-zinc-600">
                          {round.totalPallets} / {round.maxPallets} plt
                          {round.spreadKm > 0 && ` · ${round.spreadKm} km spread`}
                        </p>
                        {round.regions.length > 0 && (
                          <p className="mt-0.5 text-xs text-zinc-500">
                            {round.regions.join(" · ")}
                          </p>
                        )}
                        {isDisabled && activeOrder && (
                          <p className="mt-1 text-xs text-amber-700">
                            {acceptance.reason}
                          </p>
                        )}
                        {isBusy && (
                          <p className="mt-1 text-xs font-medium text-blue-600">
                            Assigning…
                          </p>
                        )}
                        {round.orders.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {round.orders.slice(0, 4).map((o) => (
                              <li
                                key={o.id}
                                className="truncate rounded bg-zinc-50 px-2 py-1 text-xs text-zinc-600"
                              >
                                {o.invoiceNumber} · {o.totalPallets} plt
                              </li>
                            ))}
                            {round.orders.length > 4 && (
                              <li className="px-2 text-xs text-zinc-400">
                                +{round.orders.length - 4} more
                              </li>
                            )}
                          </ul>
                        )}
                        {!isDisabled && draggingOrder && !isActive && (
                          <p className="mt-2 text-xs text-blue-600">
                            Drop here to assign
                          </p>
                        )}
                        {clickReady && !isActive && (
                          <p className="mt-2 text-xs text-blue-600">
                            Click to assign
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </aside>
    </div>
  );
}
