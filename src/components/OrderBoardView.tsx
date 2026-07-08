"use client";

import {
  OrderAssignmentPanel,
  type AssignmentDraft,
} from "@/components/OrderAssignmentPanel";
import { Badge, Button } from "@/components/ui";
import { formatM2 } from "@/lib/calculations";
import { formatDeliveryRound } from "@/lib/delivery-rounds";
import {
  orderListRowClass,
  orderStageBadgeTone,
  ORDER_STAGE_LABELS,
  type OrderDisplayStage,
} from "@/lib/order-display";
import { isOrderUrgent } from "@/lib/order-priority";
import type { OrderListCardOrder } from "@/components/OrderListCard";
import { staffOptionsFromOrder } from "@/components/OrderListCard";
import { OrderBoardDetail } from "@/components/OrderBoardDetail";

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

export type OrderBoardViewMode = "list" | "grid";

function regionKey(order: OrderListCardOrder): string {
  return (
    order.region?.trim() ||
    order.city?.trim() ||
    order.location?.trim() ||
    "Unknown"
  );
}

function locationDetail(order: OrderListCardOrder): string {
  const region = order.region?.trim();
  const city = order.city?.trim();
  const location = order.location?.trim();
  if (location && location !== region) return location;
  if (city && city !== region) return city;
  return location || city || "—";
}

function groupByRegion(orders: OrderListCardOrder[]) {
  const map = new Map<string, OrderListCardOrder[]>();
  for (const order of orders) {
    const key = regionKey(order);
    const bucket = map.get(key) ?? [];
    bucket.push(order);
    map.set(key, bucket);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map(([region, regionOrders]) => ({
      region,
      orders: [...regionOrders].sort((a, b) => {
        const aAssigned = a.assignment ? 1 : 0;
        const bAssigned = b.assignment ? 1 : 0;
        if (aAssigned !== bAssigned) return aAssigned - bAssigned;
        return a.invoiceNumber.localeCompare(b.invoiceNumber);
      }),
    }));
}

function StageBadge({ order }: { order: OrderListCardOrder }) {
  const stage = (order.deliveryStage ?? order.status) as OrderDisplayStage;
  return (
    <Badge tone={orderStageBadgeTone(stage)}>
      {order.deliveryStageLabel ?? ORDER_STAGE_LABELS[stage] ?? stage}
    </Badge>
  );
}

function AssignmentBadge({ order }: { order: OrderListCardOrder }) {
  if (!order.assignment) {
    return <Badge tone="amber">Unassigned</Badge>;
  }
  return (
    <Badge tone="green">
      {order.assignment.vehicleName} ·{" "}
      {formatDeliveryRound(order.assignment.deliveryRound, "short")}
    </Badge>
  );
}

interface OrderBoardViewProps {
  mode: OrderBoardViewMode;
  orders: OrderListCardOrder[];
  selectedOrderIds: Set<number>;
  expandedAssignId: number | null;
  expandedDetailId: number | null;
  assignState: Record<number, AssignmentDraft>;
  vehicles: VehicleOption[];
  pickers: PickerOption[];
  preferredVehicleId?: string;
  focusVehicleName?: string;
  focusDeliveryRound?: string;
  focusRound: number;
  focusVehicleId?: string;
  onSelectChange: (orderId: number, selected: boolean) => void;
  onToggleAssign: (orderId: number) => void;
  onToggleDetail: (orderId: number) => void;
  onEdit: (order: OrderListCardOrder) => void;
  onDelete: (orderId: number) => void;
  onDraftChange: (orderId: number, draft: AssignmentDraft) => void;
  onSaved: () => void;
  onError: (message: string) => void;
  onWarning: (message: string) => void;
  onQuickAssignToFocus?: (order: OrderListCardOrder) => void;
}

function OrderRow({
  order,
  selected,
  assignOpen,
  detailOpen,
  draft,
  vehicles,
  pickers,
  preferredVehicleId,
  focusVehicleName,
  focusDeliveryRound,
  focusRound,
  focusVehicleId,
  onSelectChange,
  onToggleAssign,
  onToggleDetail,
  onEdit,
  onDelete,
  onDraftChange,
  onSaved,
  onError,
  onWarning,
  onQuickAssignToFocus,
  compact,
}: {
  order: OrderListCardOrder;
  selected: boolean;
  assignOpen: boolean;
  detailOpen: boolean;
  draft: AssignmentDraft;
  vehicles: VehicleOption[];
  pickers: PickerOption[];
  preferredVehicleId?: string;
  focusVehicleName?: string;
  focusDeliveryRound?: string;
  focusRound: number;
  focusVehicleId?: string;
  onSelectChange: (selected: boolean) => void;
  onToggleAssign: () => void;
  onToggleDetail: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDraftChange: (draft: AssignmentDraft) => void;
  onSaved: () => void;
  onError: (message: string) => void;
  onWarning: (message: string) => void;
  onQuickAssignToFocus?: () => void;
  compact?: "list" | "grid";
}) {
  const stage = (order.deliveryStage ?? order.status) as OrderDisplayStage;
  const onFocusTruck =
    Boolean(focusVehicleId) &&
    order.assignment?.vehicleId === Number(focusVehicleId) &&
    order.assignment?.deliveryRound === focusRound;
  const isDelivered = stage === "delivered";
  const isComplete = stage === "delivered" || stage === "arrived";

  const shellClass = `overflow-hidden rounded-lg border border-zinc-200/80 transition ${orderListRowClass(stage)} ${
    onFocusTruck ? "ring-2 ring-blue-400 ring-offset-1" : ""
  }`;

  if (compact === "grid") {
    return (
      <div className={shellClass}>
        <div className="space-y-2 p-3">
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1 shrink-0"
              checked={selected}
              onChange={(e) => onSelectChange(e.target.checked)}
              aria-label={`Select ${order.invoiceNumber}`}
            />
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={onToggleDetail}
                className={`truncate text-left font-semibold transition hover:text-blue-700 hover:underline ${
                  detailOpen ? "text-blue-700" : "text-zinc-900"
                }`}
                title="View order details"
              >
                {order.invoiceNumber}
              </button>
              <p className="truncate text-sm text-zinc-700">
                {order.customerName}
              </p>
              <p className="mt-1 truncate text-xs text-zinc-500">
                {locationDetail(order)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <StageBadge order={order} />
            <AssignmentBadge order={order} />
            {isOrderUrgent(order) && <Badge tone="red">URGENT</Badge>}
          </div>
          <p className="text-xs text-zinc-600">
            {order.totalPallets} plt · {formatM2(order.totalM2)} m²
          </p>
          <div className="flex flex-wrap gap-1">
            {onQuickAssignToFocus && (
              <Button className="text-xs" onClick={onQuickAssignToFocus}>
                → {focusVehicleName ?? "Truck"}
              </Button>
            )}
            {!isComplete && (
              <Button
                variant="secondary"
                className="text-xs"
                onClick={onToggleAssign}
              >
                {assignOpen ? "Close" : "Assign"}
              </Button>
            )}
            <Button variant="ghost" className="text-xs" onClick={onEdit}>
              Edit
            </Button>
          </div>
        </div>
        {detailOpen && (
          <div className="border-t border-zinc-100 bg-zinc-50/80 p-3">
            <OrderBoardDetail order={order} />
          </div>
        )}
        {assignOpen && !isDelivered && (
          <div className="border-t border-zinc-100 bg-zinc-50 p-3">
            <OrderAssignmentPanel
              orderId={order.id!}
              invoiceNumber={order.invoiceNumber}
              orderPallets={order.totalPallets}
              hasAssignment={Boolean(order.assignment)}
              hasProgress={(order.proofs?.length ?? 0) > 0}
              proofPhases={(order.proofs ?? []).map((proof) => proof.phase)}
              deliveryStage={stage}
              prepStatus={
                (order as OrderListCardOrder & { prepStatus?: "pending" | "prepared" })
                  .prepStatus
              }
              loadStatus={order.loadStatus}
              staffOptions={staffOptionsFromOrder(order)}
              draft={draft}
              vehicles={vehicles}
              pickers={pickers}
              preferredVehicleId={preferredVehicleId}
              onDraftChange={onDraftChange}
              onSaved={onSaved}
              onError={onError}
              onWarning={onWarning}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <div className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
        <input
          type="checkbox"
          className="shrink-0"
          checked={selected}
          onChange={(e) => onSelectChange(e.target.checked)}
          aria-label={`Select ${order.invoiceNumber}`}
        />
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(7rem,1fr)_minmax(8rem,1.2fr)_minmax(6rem,1fr)_minmax(5rem,0.7fr)_minmax(9rem,1.1fr)] sm:items-center sm:gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={onToggleDetail}
              className={`truncate text-left font-semibold transition hover:text-blue-700 hover:underline ${
                detailOpen ? "text-blue-700" : "text-zinc-900"
              }`}
              title="View order details"
            >
              {order.invoiceNumber}
            </button>
            {isOrderUrgent(order) && (
              <span className="text-[10px] font-medium text-red-600">
                URGENT
              </span>
            )}
          </div>
          <p className="truncate text-sm text-zinc-800">{order.customerName}</p>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-700">
              {regionKey(order)}
            </p>
            <p className="truncate text-xs text-zinc-500">
              {locationDetail(order)}
            </p>
          </div>
          <p className="text-sm tabular-nums text-zinc-700">
            {order.totalPallets} plt
          </p>
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <StageBadge order={order} />
            <AssignmentBadge order={order} />
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1 sm:justify-end">
          {onQuickAssignToFocus && (
            <Button className="text-xs" onClick={onQuickAssignToFocus}>
              → {focusVehicleName ?? "Truck"}
              {focusDeliveryRound ? ` R${focusDeliveryRound}` : ""}
            </Button>
          )}
          {!isComplete && (
            <Button
              variant="secondary"
              className="text-xs"
              onClick={onToggleAssign}
            >
              {assignOpen ? "Close" : "Assign"}
            </Button>
          )}
          <Button variant="ghost" className="text-xs" onClick={onEdit}>
            Edit
          </Button>
          <Button
            variant="ghost"
            className="text-xs text-red-600"
            onClick={onDelete}
          >
            Delete
          </Button>
        </div>
      </div>
      {detailOpen && (
        <div className="border-t border-zinc-100 bg-zinc-50/80 px-3 py-3">
          <OrderBoardDetail order={order} />
        </div>
      )}
      {assignOpen && !isDelivered && (
        <div className="border-t border-zinc-100 bg-zinc-50 px-3 py-3">
          <OrderAssignmentPanel
            orderId={order.id!}
            invoiceNumber={order.invoiceNumber}
            orderPallets={order.totalPallets}
            hasAssignment={Boolean(
              order.assignment ||
                order.staff?.picker ||
                order.staff?.staff?.some((s) =>
                  ["driver", "unloader"].includes(s.role)
                )
            )}
            hasProgress={(order.proofs?.length ?? 0) > 0}
            proofPhases={(order.proofs ?? []).map((proof) => proof.phase)}
            deliveryStage={stage}
            prepStatus={
              (order as OrderListCardOrder & { prepStatus?: "pending" | "prepared" })
                .prepStatus
            }
            loadStatus={order.loadStatus}
            staffOptions={staffOptionsFromOrder(order)}
            draft={draft}
            vehicles={vehicles}
            pickers={pickers}
            preferredVehicleId={preferredVehicleId}
            onDraftChange={onDraftChange}
            onSaved={onSaved}
            onError={onError}
            onWarning={onWarning}
          />
        </div>
      )}
    </div>
  );
}

export function OrderBoardView({
  mode,
  orders,
  selectedOrderIds,
  expandedAssignId,
  expandedDetailId,
  assignState,
  vehicles,
  pickers,
  preferredVehicleId,
  focusVehicleName,
  focusDeliveryRound,
  focusRound,
  focusVehicleId,
  onSelectChange,
  onToggleAssign,
  onToggleDetail,
  onEdit,
  onDelete,
  onDraftChange,
  onSaved,
  onError,
  onWarning,
  onQuickAssignToFocus,
}: OrderBoardViewProps) {
  const groups = groupByRegion(orders);

  return (
    <div className="space-y-5">
      {groups.map(({ region, orders: regionOrders }) => {
        const assignedCount = regionOrders.filter((o) => o.assignment).length;
        const openCount = regionOrders.length - assignedCount;
        const palletTotal = regionOrders.reduce(
          (sum, o) => sum + o.totalPallets,
          0
        );

        return (
          <section key={region} className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-100/90 px-3 py-2.5">
              <div>
                <h3 className="font-semibold text-zinc-900">{region}</h3>
                <p className="text-xs text-zinc-500">
                  {regionOrders.length} order{regionOrders.length === 1 ? "" : "s"}
                  {" · "}
                  {palletTotal} plt total
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800">
                  {assignedCount} assigned
                </span>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                  {openCount} open
                </span>
              </div>
            </div>

            {mode === "list" && (
              <div className="hidden border-b border-zinc-100 bg-zinc-50/80 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 sm:grid sm:grid-cols-[auto_minmax(7rem,1fr)_minmax(8rem,1.2fr)_minmax(6rem,1fr)_minmax(5rem,0.7fr)_minmax(9rem,1.1fr)_auto] sm:items-center sm:gap-3">
                <span />
                <span>Invoice (click)</span>
                <span>Customer</span>
                <span>Location</span>
                <span>Load</span>
                <span>Status</span>
                <span className="text-right">Actions</span>
              </div>
            )}

            <div
              className={
                mode === "grid"
                  ? "grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3"
                  : "divide-y divide-zinc-100"
              }
            >
              {regionOrders.map((order) => {
                const draft =
                  assignState[order.id!] ?? {
                    vehicleId: preferredVehicleId ?? "",
                    round: focusDeliveryRound || "1",
                    pickerId: "",
                  };
                const canQuickAssign =
                  focusVehicleId &&
                  !(
                    order.assignment?.vehicleId === Number(focusVehicleId) &&
                    order.assignment?.deliveryRound === focusRound
                  );

                return (
                  <OrderRow
                    key={order.id}
                    order={order}
                    selected={selectedOrderIds.has(order.id!)}
                    assignOpen={expandedAssignId === order.id}
                    detailOpen={expandedDetailId === order.id}
                    draft={draft}
                    vehicles={vehicles}
                    pickers={pickers}
                    preferredVehicleId={preferredVehicleId}
                    focusVehicleName={focusVehicleName}
                    focusDeliveryRound={focusDeliveryRound}
                    focusRound={focusRound}
                    focusVehicleId={focusVehicleId}
                    onSelectChange={(checked) =>
                      onSelectChange(order.id!, checked)
                    }
                    onToggleAssign={() => onToggleAssign(order.id!)}
                    onToggleDetail={() => onToggleDetail(order.id!)}
                    onEdit={() => onEdit(order)}
                    onDelete={() => onDelete(order.id!)}
                    onDraftChange={(next) => onDraftChange(order.id!, next)}
                    onSaved={onSaved}
                    onError={onError}
                    onWarning={onWarning}
                    onQuickAssignToFocus={
                      canQuickAssign && onQuickAssignToFocus
                        ? () => onQuickAssignToFocus(order)
                        : undefined
                    }
                    compact={mode}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
