"use client";

import { Badge } from "@/components/ui";
import {
  formatM2,
  kgPerM2FromPalletSpec,
  tileSpecOptionsForItem,
} from "@/lib/calculations";
import { getTilePalletSpec, normalizeOrderUnit } from "@/lib/constants";
import {
  deliveryScheduleBadgeTone,
  formatDeliverySchedule,
  isOrderReadyToShip,
} from "@/lib/delivery-schedule";
import { formatDeliveryRound } from "@/lib/delivery-rounds";
import {
  orderStageBadgeTone,
  type OrderDisplayStage,
} from "@/lib/order-display";
import type { OrderListCardOrder } from "@/components/OrderListCard";

function parseReferentiFromNotes(notes?: string | null): string {
  const match = notes?.match(/Referenti:\s*([^·\n]+)/i);
  return match?.[1]?.trim() ?? "";
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        {label}
      </p>
      <p className="mt-0.5 break-words text-sm font-medium text-zinc-800">
        {value}
      </p>
    </div>
  );
}

function formatItemQty(item: OrderListCardOrder["items"][number]): string {
  const unit = normalizeOrderUnit(item.unit);
  if (unit === "m2" && item.quantityM2 != null) {
    return `${formatM2(item.quantityM2)} m²`;
  }
  if (unit === "kg" && item.weightKg != null) {
    return `${item.weightKg.toFixed(0)} kg`;
  }
  if (unit === "meter" && item.lengthM != null) {
    return `${item.lengthM} m`;
  }
  if (unit === "piece" && item.pieceCount != null) {
    return `${item.pieceCount} pcs`;
  }
  if (item.palletCount != null) {
    return `${item.palletCount} plt`;
  }
  return "—";
}

export function OrderBoardDetail({ order }: { order: OrderListCardOrder }) {
  const stage = (order.deliveryStage ?? order.status) as OrderDisplayStage;
  const referenti =
    order.salesAgentName?.trim() ||
    order.salesAgentDisplayName?.trim() ||
    parseReferentiFromNotes(order.notes) ||
    "—";
  const locationParts = [
    order.region?.trim(),
    order.city?.trim() && order.city.trim() !== order.region?.trim()
      ? order.city.trim()
      : null,
    order.location?.trim(),
  ].filter(Boolean);
  const fullLocation =
    locationParts.length > 0 ? locationParts.join(" · ") : "—";
  const coords =
    order.lat != null && order.lng != null
      ? `${order.lat.toFixed(5)}, ${order.lng.toFixed(5)}`
      : null;
  const orderKgPerM2 =
    order.totalM2 > 0 ? order.totalWeightKg / order.totalM2 : 0;

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DetailField label="Full location" value={fullLocation} />
        {coords && <DetailField label="Coordinates" value={coords} />}
        <DetailField label="Order date" value={order.orderDate} />
        <DetailField label="Referenti" value={referenti} />
        <DetailField label="Price" value={`€${order.price.toFixed(2)}`} />
        <DetailField
          label="Load"
          value={`${order.totalPallets} plt · ${formatM2(order.totalM2)} m² · ${order.totalWeightKg.toFixed(0)} kg${
            orderKgPerM2 > 0
              ? ` (~${orderKgPerM2.toFixed(1)} kg/m²)`
              : ""
          }`}
        />
      </div>

      {order.assignment && (
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-900">
          <span className="font-medium">Truck · </span>
          {order.assignment.vehicleName}
          {order.assignment.plateNumber
            ? ` (${order.assignment.plateNumber})`
            : ""}
          {" · "}
          {formatDeliveryRound(order.assignment.deliveryRound, "short")}
          {order.assignment.driverName
            ? ` · Driver: ${order.assignment.driverName}`
            : ""}
          {order.staff?.picker && (
            <span className="block text-emerald-800">
              Picker · {order.staff.picker.employeeName}
            </span>
          )}
        </div>
      )}

      {order.items.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Products ({order.items.length})
          </p>
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
            {order.items.map((item, idx) => {
              const unit = normalizeOrderUnit(item.unit);
              const lineWeight =
                unit === "m2" && (item.weightKg ?? 0) > 0
                  ? item.weightKg!
                  : unit === "kg"
                    ? item.weightKg ?? 0
                    : 0;
              const lineKgPerM2 =
                unit === "m2" &&
                (item.quantityM2 ?? 0) > 0 &&
                lineWeight > 0
                  ? lineWeight / (item.quantityM2 ?? 1)
                  : unit === "m2" &&
                      item.tileWidthCm &&
                      item.tileHeightCm
                    ? kgPerM2FromPalletSpec(
                        getTilePalletSpec(
                          item.tileWidthCm,
                          item.tileHeightCm,
                          tileSpecOptionsForItem({
                            tileWidthCm: item.tileWidthCm,
                            tileHeightCm: item.tileHeightCm,
                            tileThicknessCm: item.tileThicknessCm,
                          })
                        ).kgPerPallet,
                        getTilePalletSpec(
                          item.tileWidthCm,
                          item.tileHeightCm,
                          tileSpecOptionsForItem({
                            tileWidthCm: item.tileWidthCm,
                            tileHeightCm: item.tileHeightCm,
                            tileThicknessCm: item.tileThicknessCm,
                          })
                        ).m2PerPallet
                      )
                    : 0;

              return (
              <li
                key={idx}
                className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-zinc-900">
                    {item.productName?.trim() || "Product"}
                  </p>
                  {item.productEan && (
                    <p className="text-xs text-zinc-500">{item.productEan}</p>
                  )}
                  {unit === "m2" &&
                    item.tileWidthCm &&
                    item.tileHeightCm && (
                      <p className="text-xs text-zinc-500">
                        {item.tileWidthCm}×{item.tileHeightCm} cm
                        {item.tileThicknessCm
                          ? ` · ${(item.tileThicknessCm * 10).toFixed(0)} mm`
                          : ""}
                        {lineKgPerM2 > 0
                          ? ` · ~${lineKgPerM2.toFixed(1)} kg/m²`
                          : ""}
                      </p>
                    )}
                </div>
                <div className="shrink-0 text-right tabular-nums text-zinc-600">
                  <p>{formatItemQty(item)}</p>
                  {lineWeight > 0 && (
                    <p className="text-xs text-zinc-500">
                      ~{lineWeight.toFixed(0)} kg
                    </p>
                  )}
                </div>
              </li>
              );
            })}
          </ul>
        </div>
      )}

      {order.notes?.trim() && (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Notes
          </p>
          <p className="whitespace-pre-wrap break-words text-sm text-zinc-600">
            {order.notes.trim()}
          </p>
        </div>
      )}
    </div>
  );
}
