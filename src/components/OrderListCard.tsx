"use client";

import Link from "next/link";
import { OrderInvoice, type OrderInvoiceData } from "@/components/OrderInvoice";
import {
  DeliveryLinkBadge,
  DeliveryLinkNotice,
  deliveryLinkCardClass,
  hasDeliveryLinks,
} from "@/components/DeliveryLinkNotice";
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

export type OrderListCardOrder = OrderInvoiceData;

export interface OrderListCardProps {
  order: OrderListCardOrder;
  selected: boolean;
  expanded: boolean;
  highlightFocus?: boolean;
  highlightAvailable?: boolean;
  preferredVehicleId?: string;
  focusVehicleName?: string;
  focusDeliveryRound?: string;
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
  onQuickAssignToFocus?: () => void;
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        {label}
      </p>
      <p className="truncate text-sm font-medium text-zinc-800">{value}</p>
    </div>
  );
}

function MetricBlock({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string | number;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-lg px-3 py-2 ${
        emphasis ? "bg-zinc-900 text-white" : "bg-white"
      }`}
    >
      <p
        className={`text-[10px] font-semibold uppercase tracking-wider ${
          emphasis ? "text-zinc-400" : "text-zinc-400"
        }`}
      >
        {label}
      </p>
      <p
        className={`mt-0.5 text-base font-semibold tabular-nums ${
          emphasis ? "text-white" : "text-zinc-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function staffOptionsFromOrder(order: OrderListCardOrder) {
  const options: Array<{ id: number; name: string; role: string }> = [];
  const staff = order.staff as
    | {
        picker?: { employeeId?: number; employeeName: string } | null;
        driver?: { employeeId?: number; employeeName: string } | null;
        staff?: Array<{ employeeId?: number; employeeName: string; role: string }>;
      }
    | undefined;
  if (staff?.picker?.employeeId) {
    options.push({
      id: staff.picker.employeeId,
      name: staff.picker.employeeName,
      role: "picker",
    });
  }
  if (staff?.driver?.employeeId) {
    options.push({
      id: staff.driver.employeeId,
      name: staff.driver.employeeName,
      role: "driver",
    });
  }
  for (const member of staff?.staff ?? []) {
    if (!member.employeeId) continue;
    if (options.some((option) => option.id === member.employeeId)) continue;
    options.push({
      id: member.employeeId,
      name: member.employeeName,
      role: member.role,
    });
  }
  return options;
}

export { staffOptionsFromOrder };

export function OrderListCard({
  order,
  selected,
  expanded,
  highlightFocus,
  highlightAvailable,
  preferredVehicleId,
  focusVehicleName,
  focusDeliveryRound,
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
  onQuickAssignToFocus,
}: OrderListCardProps) {
  const stage = (order.deliveryStage ?? order.status) as OrderDisplayStage;
  const isDelivered = stage === "delivered";
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
  const region = order.region ?? order.city ?? "—";
  const productPreview = order.items.slice(0, 2);
  const moreProducts = Math.max(0, order.items.length - productPreview.length);

  return (
    <article
      className={`overflow-hidden rounded-xl border shadow-sm transition-shadow hover:shadow-md ${orderListRowClass(stage)} ${deliveryLinkCardClass(order.deliveryLinks)} ${
        highlightFocus
          ? "ring-2 ring-blue-400"
          : highlightAvailable
            ? "ring-1 ring-amber-300"
            : ""
      }`}
    >
      <div className="flex flex-col gap-0">
        <div className="flex flex-col gap-3 border-b border-zinc-200/80 bg-white px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <input
              type="checkbox"
              className="mt-2 shrink-0"
              checked={selected}
              onChange={(e) => onSelectChange(e.target.checked)}
              aria-label={`Select order ${order.invoiceNumber}`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                Invoice
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-bold tracking-tight text-zinc-950">
                  {order.invoiceNumber}
                </h3>
                {isOrderUrgent(order) && <Badge tone="red">URGENT</Badge>}
                <DeliveryLinkBadge links={order.deliveryLinks} />
              </div>
              <p className="mt-1 text-base font-semibold text-zinc-800">
                {order.customerName}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone={orderStageBadgeTone(stage)}>
                  {order.deliveryStageLabel ?? order.status.replace(/_/g, " ")}
                </Badge>
                <Badge tone={deliveryScheduleBadgeTone(order)}>
                  {formatDeliverySchedule(order)}
                </Badge>
                {!isOrderReadyToShip(order) && (
                  <Badge tone="amber">
                    Ships {order.requestedDeliveryDate ?? "later"}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-1 sm:justify-end">
            {onQuickAssignToFocus &&
              preferredVehicleId &&
              !order.assignment && (
                <Button
                  className="text-xs"
                  onClick={onQuickAssignToFocus}
                >
                  → {focusVehicleName ?? "Focus truck"}
                  {focusDeliveryRound ? ` R${focusDeliveryRound}` : ""}
                </Button>
              )}
            <Button variant="secondary" className="text-xs" onClick={onToggleExpand}>
              {expanded ? "Hide invoice" : "View invoice"}
            </Button>
            <Button variant="ghost" className="text-xs" onClick={onEdit}>
              Edit
            </Button>
            <Button
              variant="ghost"
              className="text-xs text-red-600 hover:text-red-700"
              onClick={onDelete}
            >
              Delete
            </Button>
          </div>
        </div>

        {hasDeliveryLinks(order.deliveryLinks) && (
          <div className="border-b border-sky-100 bg-white px-4 py-2">
            <DeliveryLinkNotice links={order.deliveryLinks} />
          </div>
        )}

        <div className="grid gap-3 border-b border-zinc-100 bg-zinc-50/70 px-4 py-3 sm:grid-cols-2 lg:grid-cols-5">
          <MetaItem label="Region" value={region} />
          <MetaItem label="Order date" value={order.orderDate} />
          <MetaItem label="Referenti" value={referenti || "—"} />
          <MetaItem label="Price" value={`€${order.price.toFixed(2)}`} />
          <MetaItem
            label="Products"
            value={
              order.items.length === 0
                ? "—"
                : `${order.items.length} line${order.items.length === 1 ? "" : "s"}`
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-zinc-100 bg-zinc-100/50 px-4 py-3 sm:grid-cols-4">
          <MetricBlock
            label="Pallets"
            value={order.totalPallets}
            emphasis
          />
          <MetricBlock label="m²" value={formatM2(order.totalM2)} />
          <MetricBlock
            label="Weight"
            value={`${order.totalWeightKg.toFixed(0)} kg`}
          />
          <MetricBlock label="Pieces" value={order.totalPieces} />
        </div>

        {order.items.length > 0 && (
          <div className="border-b border-zinc-100 px-4 py-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Product lines
            </p>
            <ul className="space-y-1.5 text-sm text-zinc-700">
              {productPreview.map((item, idx) => {
                const unit = normalizeOrderUnit(item.unit);
                return (
                  <li key={idx} className="flex flex-wrap gap-x-1.5 break-words">
                    <span className="font-medium text-zinc-900">
                      {item.productName?.trim() || "Product"}
                    </span>
                    {unit === "m2" && item.quantityM2 != null ? (
                      <span className="text-zinc-500">
                        · {formatM2(item.quantityM2)} m²
                      </span>
                    ) : null}
                    {unit === "kg" && item.weightKg != null ? (
                      <span className="text-zinc-500">
                        · {item.weightKg.toFixed(0)} kg
                      </span>
                    ) : null}
                    {unit === "meter" && item.lengthM != null ? (
                      <span className="text-zinc-500">· {item.lengthM} m</span>
                    ) : null}
                    {unit === "piece" && item.pieceCount != null ? (
                      <span className="text-zinc-500">
                        · {item.pieceCount} pcs
                      </span>
                    ) : null}
                  </li>
                );
              })}
              {moreProducts > 0 && (
                <li className="text-xs text-zinc-500">
                  +{moreProducts} more product line{moreProducts === 1 ? "" : "s"}
                </li>
              )}
            </ul>
          </div>
        )}

        {(order.assignment ||
          order.staff?.picker ||
          order.loadStatus ||
          order.proofs?.length ||
          (isOrderUrgent(order) && !order.assignment)) && (
          <div className="space-y-1.5 border-b border-zinc-100 bg-white px-4 py-3 text-sm text-zinc-600">
            {order.assignment && (
              <p className="font-medium text-zinc-800">
                <span className="text-zinc-500">Truck · </span>
                {order.assignment.vehicleName}
                {" · "}
                {formatDeliveryRound(order.assignment.deliveryRound, "short")}
                {order.assignment.driverName
                  ? ` · ${order.assignment.driverName}`
                  : ""}
              </p>
            )}
            {order.staff?.picker && (
              <p>
                <span className="text-zinc-500">Picker · </span>
                {order.staff.picker.employeeName}
              </p>
            )}
            {order.loadStatus === "loaded" && (
              <p className="text-green-700">Loaded on truck</p>
            )}
            {order.loadStatus === "load_skipped" && (
              <p className="text-red-700">
                Not loaded
                {order.loadNotes ? `: ${order.loadNotes}` : ""}
              </p>
            )}
            {order.loadStatus === "pending" && order.assignment && (
              <p className="text-amber-700">Waiting for loader</p>
            )}
            {order.proofs && order.proofs.length > 0 && (
              <p className="text-zinc-500">
                {order.proofs.length} delivery proof step
                {order.proofs.length !== 1 ? "s" : ""}
              </p>
            )}
            {isOrderUrgent(order) && !order.assignment && (
              <div className="flex flex-wrap gap-1 pt-1">
                <Button
                  variant="secondary"
                  className="text-xs"
                  onClick={onSuggestUrgentRoute}
                >
                  Suggest truck
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

      <div className="bg-zinc-50 px-4 py-3">
        {isDelivered ? (
          <p className="text-sm font-medium text-green-700">Delivery complete</p>
        ) : (
          <OrderAssignmentPanel
            orderId={order.id!}
            invoiceNumber={order.invoiceNumber}
            orderPallets={order.totalPallets}
            hasAssignment={hasAnyAssignment}
            hasProgress={hasProgress}
            proofPhases={(order.proofs ?? []).map((proof) => proof.phase)}
            deliveryStage={stage}
            prepStatus={
              (order as OrderListCardOrder & { prepStatus?: "pending" | "prepared" })
                .prepStatus
            }
            loadStatus={order.loadStatus}
            staffOptions={staffOptionsFromOrder(order)}
            deliveryLinks={order.deliveryLinks}
            draft={draft}
            vehicles={vehicles}
            pickers={pickers}
            preferredVehicleId={preferredVehicleId}
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
