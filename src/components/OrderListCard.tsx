"use client";

import Link from "next/link";
import { OrderInvoice, type OrderInvoiceData } from "@/components/OrderInvoice";
import {
  OrderAssignmentPanel,
  type AssignmentDraft,
} from "@/components/OrderAssignmentPanel";
import { Badge, Button } from "@/components/ui";
import { formatM2 } from "@/lib/calculations";
import { normalizeOrderUnit } from "@/lib/constants";
import {
  formatDeliverySchedule,
  deliveryScheduleBadgeTone,
  isOrderReadyToShip,
} from "@/lib/delivery-schedule";
import { formatDeliveryRound } from "@/lib/delivery-rounds";
import {
  orderListRowClass,
  orderStageBadgeTone,
  type OrderDisplayStage,
} from "@/lib/order-display";
import { isOrderUrgent } from "@/lib/order-priority";

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

function parseReferentiFromNotes(notes?: string | null): string {
  const match = notes?.match(/Referenti:\s*([^·\n]+)/i);
  return match?.[1]?.trim() ?? "";
}

function orderReferentiDisplay(order: OrderListCardOrder): string {
  return (
    order.salesAgentName?.trim() ||
    parseReferentiFromNotes(order.notes) ||
    ""
  );
}

function StatChip({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-md border border-zinc-200/80 bg-white px-2.5 py-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
        {label}
      </p>
      <p className="text-sm font-medium text-zinc-900">{value}</p>
    </div>
  );
}

export type OrderListCardOrder = OrderInvoiceData;

export interface OrderListCardProps {
  order: OrderListCardOrder;
  selected: boolean;
  expanded: boolean;
  highlightFocus?: boolean;
  highlightAvailable?: boolean;
  draft: AssignmentDraft;
  vehicles: VehicleOption[];
  pickers: PickerOption[];
  onSelectChange: (selected: boolean) => void;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDraftChange: (draft: AssignmentDraft) => void;
  onSaved: () => void;
  onError: (message: string) => void;
  onWarning: (message: string) => void;
  onSuggestUrgentRoute: () => void;
}

export function OrderListCard({
  order,
  selected,
  expanded,
  highlightFocus,
  highlightAvailable,
  draft,
  vehicles,
  pickers,
  onSelectChange,
  onToggleExpand,
  onEdit,
  onDelete,
  onDraftChange,
  onSaved,
  onError,
  onWarning,
  onSuggestUrgentRoute,
}: OrderListCardProps) {
  const stage = (order.deliveryStage ?? order.status) as OrderDisplayStage;
  const isComplete = stage === "delivered" || stage === "arrived";
  const hasAnyAssignment = Boolean(
    order.assignment ||
      order.staff?.picker ||
      order.staff?.staff?.some((s) =>
        ["driver", "unloader"].includes(s.role)
      )
  );
  const hasProgress = (order.proofs?.length ?? 0) > 0;
  const referenti = orderReferentiDisplay(order);

  return (
    <article
      className={`overflow-hidden rounded-lg border border-zinc-200 ${orderListRowClass(stage)} ${
        highlightFocus
          ? "ring-2 ring-blue-300"
          : highlightAvailable
            ? "ring-1 ring-amber-200"
            : ""
      }`}
    >
      <div className="flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-3">
            <input
              type="checkbox"
              className="mt-1 shrink-0"
              checked={selected}
              onChange={(e) => onSelectChange(e.target.checked)}
              aria-label={`Select order ${order.invoiceNumber}`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-zinc-900">
                  {order.invoiceNumber}
                </h3>
                {isOrderUrgent(order) && <Badge tone="red">URGENT</Badge>}
                <Badge tone={orderStageBadgeTone(stage)}>
                  {order.deliveryStageLabel ?? order.status.replace(/_/g, " ")}
                </Badge>
                <Badge tone={deliveryScheduleBadgeTone(order)}>
                  {formatDeliverySchedule(order)}
                </Badge>
              </div>
              <p className="mt-1 text-sm font-medium text-zinc-800">
                {order.customerName}
              </p>
              <p className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-zinc-500">
                {referenti ? <span>Referenti: {referenti}</span> : null}
                <span>{order.region ?? order.city ?? "—"}</span>
                <span>{order.orderDate}</span>
                <span>€{order.price.toFixed(2)}</span>
              </p>
              {!isOrderReadyToShip(order) && (
                <p className="mt-1 text-[11px] text-amber-700">
                  Not in dispatch until {order.requestedDeliveryDate}
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-1 lg:justify-end">
            <Button variant="ghost" className="text-xs" onClick={onToggleExpand}>
              {expanded ? "Hide" : "Details"}
            </Button>
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

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <StatChip label="m²" value={formatM2(order.totalM2)} />
          <StatChip label="Pieces" value={order.totalPieces} />
          <StatChip label="Pallets" value={order.totalPallets} />
          <StatChip
            label="Kg"
            value={order.totalWeightKg.toFixed(0)}
          />
          <StatChip label="Price" value={`€${order.price.toFixed(2)}`} />
        </div>

        {order.items.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              Products
            </p>
            <ul className="space-y-1 text-xs leading-snug text-zinc-700">
              {order.items.map((item, idx) => {
                const unit = normalizeOrderUnit(item.unit);
                return (
                  <li key={idx} className="break-words">
                    <span className="font-medium text-zinc-900">
                      {item.productName?.trim() || "Product"}
                    </span>
                    {unit === "m2" && item.tileWidthCm && item.tileHeightCm ? (
                      <span className="text-zinc-500">
                        {" "}
                        · {item.tileWidthCm}×{item.tileHeightCm} cm
                      </span>
                    ) : null}
                    {unit === "m2" && item.quantityM2 != null ? (
                      <span className="text-zinc-600">
                        {" "}
                        · {formatM2(item.quantityM2)} m²
                      </span>
                    ) : null}
                    {unit === "kg" && item.weightKg != null ? (
                      <span className="text-zinc-600">
                        {" "}
                        · {item.weightKg.toFixed(0)} kg
                        {item.pieceCount != null
                          ? ` · ${item.pieceCount} pcs`
                          : ""}
                      </span>
                    ) : null}
                    {unit === "meter" && item.lengthM != null ? (
                      <span className="text-zinc-600">
                        {" "}
                        · {item.lengthM} m
                      </span>
                    ) : null}
                    {unit === "piece" && item.pieceCount != null ? (
                      <span className="text-zinc-600">
                        {" "}
                        · {item.pieceCount} pcs
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {(order.proofs?.length ||
          order.loadStatus ||
          order.assignment ||
          order.staff?.picker ||
          (isOrderUrgent(order) && !order.assignment)) && (
          <div className="space-y-1 rounded-md border border-zinc-100 bg-zinc-50/60 px-3 py-2 text-xs text-zinc-600">
            {order.proofs && order.proofs.length > 0 && (
              <p>
                {order.proofs.length} proof step
                {order.proofs.length !== 1 ? "s" : ""} recorded
              </p>
            )}
            {order.loadStatus === "loaded" && (
              <p className="text-green-700">✓ Loaded on truck</p>
            )}
            {order.loadStatus === "load_skipped" && (
              <p className="text-red-700">
                ✗ Not loaded
                {order.loadNotes ? `: ${order.loadNotes}` : ""}
              </p>
            )}
            {order.loadStatus === "pending" && order.assignment && (
              <p className="text-amber-700">○ Waiting for loader</p>
            )}
            {order.assignment && (
              <p>
                {order.assignment.vehicleName} ·{" "}
                {formatDeliveryRound(order.assignment.deliveryRound, "short")}
                {order.assignment.driverName &&
                  ` · ${order.assignment.driverName}`}
              </p>
            )}
            {order.staff?.picker && (
              <p>Picker: {order.staff.picker.employeeName}</p>
            )}
            {isOrderUrgent(order) && !order.assignment && (
              <div className="flex flex-wrap gap-1 pt-1">
                <Button
                  variant="secondary"
                  className="text-xs"
                  onClick={onSuggestUrgentRoute}
                >
                  Find best truck
                </Button>
                <Link
                  href="/dispatch"
                  className="inline-flex items-center rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                >
                  Dispatch board
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-zinc-200 bg-white px-3 py-3 sm:px-4">
        {isComplete ? (
          <p className="text-xs text-green-700">
            {stage === "delivered"
              ? "Delivery complete"
              : "Arrived at customer"}
          </p>
        ) : (
          <OrderAssignmentPanel
            orderId={order.id!}
            invoiceNumber={order.invoiceNumber}
            hasAssignment={hasAnyAssignment}
            hasProgress={hasProgress}
            draft={draft}
            vehicles={vehicles}
            pickers={pickers}
            onDraftChange={onDraftChange}
            onSaved={onSaved}
            onError={onError}
            onWarning={onWarning}
          />
        )}
      </div>

      {expanded && (
        <div className="border-t border-zinc-200 bg-zinc-100/80 px-4 py-6">
          <OrderInvoice order={order} />
        </div>
      )}
    </article>
  );
}
