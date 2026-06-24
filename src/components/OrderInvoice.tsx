import { Badge } from "@/components/ui";
import { formatDeliverySchedule } from "@/lib/delivery-schedule";
import { formatDeliveryRound } from "@/lib/delivery-rounds";
import { OrderAssignmentTimeline } from "@/components/OrderAssignmentTimeline";
import { BRAND } from "@/lib/brand";
import { EMPLOYEE_ROLE_LABELS, DELIVERY_PROOF_LABELS, type DeliveryProofPhase, type EmployeeRole } from "@/lib/constants";
import {
  orderStageBadgeTone,
  type OrderDisplayStage,
} from "@/lib/order-display";

export interface OrderInvoiceItem {
  productType: string;
  productName?: string | null;
  quantityM2?: number | null;
  pieceCount?: number | null;
  palletCount?: number | null;
  weightKg?: number | null;
  tileWidthCm?: number | null;
  tileHeightCm?: number | null;
  tileThicknessCm?: number | null;
  calculatedPieces?: number | null;
  calculatedPallets?: number | null;
}

export interface OrderInvoiceData {
  id?: number;
  invoiceNumber: string;
  customerName: string;
  region?: string | null;
  city?: string | null;
  location: string;
  lat?: number | null;
  lng?: number | null;
  orderDate: string;
  requestedDeliveryDate?: string | null;
  deliveryTimePreference?: string | null;
  status: string;
  deliveryStage?: OrderDisplayStage;
  deliveryStageLabel?: string;
  loadStatus?: "pending" | "loaded" | "load_skipped";
  loadNotes?: string | null;
  price: number;
  notes?: string | null;
  totalM2: number;
  totalPieces: number;
  totalPallets: number;
  totalWeightKg: number;
  items: OrderInvoiceItem[];
  assignment?: {
    vehicleName: string;
    plateNumber?: string;
    deliveryRound: number;
    driverName?: string | null;
  } | null;
  staff?: {
    picker?: { employeeName: string } | null;
    driver?: { employeeName: string } | null;
    staff?: Array<{ role: string; employeeName: string }>;
  };
  proofs?: Array<{
    phase: string;
    employeeName: string;
    capturedAt: string;
    photoUrl?: string | null;
    notes?: string | null;
  }>;
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function itemDescription(item: OrderInvoiceItem) {
  if (item.productType === "adhesive") {
    return item.productName?.trim() || "Adhesive / grout";
  }
  if (item.productName?.trim()) return item.productName.trim();
  if (item.tileWidthCm != null && item.tileHeightCm != null) {
    return `Tile ${item.tileWidthCm}×${item.tileHeightCm} cm`;
  }
  return "Tile";
}

function itemDimensions(item: OrderInvoiceItem) {
  if (item.productType !== "tile") return "—";
  if (item.tileWidthCm == null || item.tileHeightCm == null) return "—";
  const face = `${item.tileWidthCm} × ${item.tileHeightCm} cm`;
  if (item.tileThicknessCm != null) {
    return `${face} · ${item.tileThicknessCm * 10} mm thick`;
  }
  return face;
}

const statusTone: Record<string, "green" | "amber" | "blue" | "red" | "slate"> =
  {
    pending: "amber",
    assigned: "blue",
    in_transit: "blue",
    delivered: "green",
    cancelled: "red",
  };

export function OrderInvoice({ order }: { order: OrderInvoiceData }) {
  const driverName =
    order.staff?.driver?.employeeName ?? order.assignment?.driverName ?? null;
  const pickerName = order.staff?.picker?.employeeName ?? null;
  const displayStage = (order.deliveryStage ??
    order.status) as OrderDisplayStage;
  const displayLabel =
    order.deliveryStageLabel ?? order.status.replace(/_/g, " ");
  const badgeTone = orderStageBadgeTone(displayStage);

  return (
    <div className="mx-auto max-w-4xl rounded-lg border border-zinc-200 bg-white p-6 shadow-sm print:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 pb-6">
        <div>
          <p className="text-lg font-semibold tracking-tight text-zinc-900">
            {BRAND.name}
          </p>
          <p className="mt-1 text-sm text-zinc-500">{BRAND.tagline}</p>
          <p className="mt-2 text-xs text-zinc-500">
            {BRAND.warehouse.address}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            Order / Invoice
          </p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">
            {order.invoiceNumber}
          </p>
          <p className="mt-2 text-sm text-zinc-600">Date: {order.orderDate}</p>
          <p className="mt-1 text-sm text-zinc-600">
            Schedule: {formatDeliverySchedule(order)}
          </p>
          <div className="mt-2 flex justify-end">
            <Badge tone={badgeTone}>{displayLabel}</Badge>
          </div>
          {order.loadStatus === "loaded" && (
            <p className="mt-2 text-xs text-green-700">Loaded on truck</p>
          )}
          {order.loadStatus === "load_skipped" && (
            <p className="mt-2 text-xs text-red-700">
              Not loaded{order.loadNotes ? `: ${order.loadNotes}` : ""}
            </p>
          )}
          {order.loadStatus === "pending" && order.assignment && (
            <p className="mt-2 text-xs text-amber-700">Waiting for loader</p>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            Customer
          </p>
          <p className="mt-1 font-medium text-zinc-900">{order.customerName}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            Delivery
          </p>
          <p className="mt-1 font-medium text-zinc-900">
            {order.region || "—"}
            {order.city && order.city !== order.region ? ` · ${order.city}` : ""}
          </p>
          <p className="mt-1 text-sm text-zinc-600">{order.location || "—"}</p>
          {order.lat != null && order.lng != null && (
            <p className="mt-1 text-xs text-zinc-400">
              {order.lat.toFixed(5)}, {order.lng.toFixed(5)}
            </p>
          )}
        </div>
      </div>

      {(pickerName || driverName || order.assignment) && (
        <div className="mt-6 rounded-md border border-zinc-100 bg-zinc-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            Logistics
          </p>
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {pickerName && (
              <>
                <dt className="text-zinc-500">Picker</dt>
                <dd className="font-medium text-zinc-900">{pickerName}</dd>
              </>
            )}
            {driverName && (
              <>
                <dt className="text-zinc-500">Driver</dt>
                <dd className="font-medium text-zinc-900">{driverName}</dd>
              </>
            )}
            {order.assignment && (
              <>
                <dt className="text-zinc-500">Vehicle</dt>
                <dd className="font-medium text-zinc-900">
                  {order.assignment.vehicleName}
                  {order.assignment.plateNumber
                    ? ` (${order.assignment.plateNumber})`
                    : ""}
                </dd>
                <dt className="text-zinc-500">Delivery round</dt>
                <dd className="font-medium text-zinc-900">
                  {formatDeliveryRound(order.assignment.deliveryRound)}
                </dd>
              </>
            )}
          </dl>
          {order.staff?.staff && order.staff.staff.length > 0 && (
            <p className="mt-3 text-xs text-zinc-500">
              Team:{" "}
              {order.staff.staff
                .map(
                  (s) =>
                    `${s.employeeName} (${
                      EMPLOYEE_ROLE_LABELS[s.role as EmployeeRole] ??
                      s.role.replace(/_/g, " ")
                    })`
                )
                .join(" · ")}
            </p>
          )}
        </div>
      )}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-zinc-900 text-left text-xs uppercase tracking-wider text-zinc-500">
              <th className="py-2 pr-3 font-medium">#</th>
              <th className="py-2 pr-3 font-medium">Product</th>
              <th className="py-2 pr-3 font-medium">Dimensions</th>
              <th className="py-2 pr-3 text-right font-medium">m²</th>
              <th className="py-2 pr-3 text-right font-medium">Pieces</th>
              <th className="py-2 pr-3 text-right font-medium">Pallets</th>
              <th className="py-2 text-right font-medium">Weight</th>
            </tr>
          </thead>
          <tbody>
            {order.items.length === 0 ? (
              <tr className="border-b border-zinc-100">
                <td colSpan={7} className="py-4 text-center text-zinc-400">
                  No line items
                </td>
              </tr>
            ) : (
              order.items.map((item, i) => (
                <tr key={i} className="border-b border-zinc-100">
                  <td className="py-3 pr-3 text-zinc-400">{i + 1}</td>
                  <td className="py-3 pr-3">
                    <p className="font-medium text-zinc-900">
                      {itemDescription(item)}
                    </p>
                    <p className="text-xs capitalize text-zinc-400">
                      {item.productType}
                    </p>
                  </td>
                  <td className="py-3 pr-3 text-zinc-600">
                    {itemDimensions(item)}
                  </td>
                  <td className="py-3 pr-3 text-right tabular-nums text-zinc-900">
                    {item.productType === "tile"
                      ? (item.quantityM2 ?? 0).toFixed(2)
                      : "—"}
                  </td>
                  <td className="py-3 pr-3 text-right tabular-nums text-zinc-900">
                    {item.pieceCount ?? "—"}
                  </td>
                  <td className="py-3 pr-3 text-right tabular-nums text-zinc-900">
                    {item.palletCount ?? "—"}
                  </td>
                  <td className="py-3 text-right tabular-nums text-zinc-900">
                    {item.weightKg != null
                      ? `${item.weightKg.toFixed(1)} kg`
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-zinc-900 font-medium text-zinc-900">
              <td colSpan={3} className="py-3 pr-3 text-right uppercase text-xs tracking-wider text-zinc-500">
                Totals
              </td>
              <td className="py-3 pr-3 text-right tabular-nums">
                {order.totalM2.toFixed(2)}
              </td>
              <td className="py-3 pr-3 text-right tabular-nums">
                {order.totalPieces}
              </td>
              <td className="py-3 pr-3 text-right tabular-nums">
                {order.totalPallets}
              </td>
              <td className="py-3 text-right tabular-nums">
                {order.totalWeightKg.toFixed(1)} kg
              </td>
            </tr>
            <tr>
              <td
                colSpan={6}
                className="py-3 pr-3 text-right text-sm text-zinc-500"
              >
                Order value
              </td>
              <td className="py-3 text-right text-lg font-semibold tabular-nums text-zinc-900">
                {formatPrice(order.price)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {order.id != null && (
        <div className="mt-6 border-t border-zinc-100 pt-4">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            Assignment history
          </p>
          <OrderAssignmentTimeline orderId={order.id} />
        </div>
      )}

      {order.proofs && order.proofs.length > 0 && (
        <div className="mt-6 border-t border-zinc-100 pt-4">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            Delivery proof
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {order.proofs.map((proof) => (
              <div
                key={`${proof.phase}-${proof.capturedAt}`}
                className="rounded-lg border border-zinc-100 bg-zinc-50 p-3"
              >
                <p className="text-sm font-medium text-zinc-900">
                  {DELIVERY_PROOF_LABELS[proof.phase as DeliveryProofPhase] ??
                    proof.phase}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {proof.employeeName} ·{" "}
                  {new Date(proof.capturedAt).toLocaleString()}
                </p>
                {proof.notes && (
                  <p className="mt-1 text-xs text-zinc-600">{proof.notes}</p>
                )}
                {proof.photoUrl && (
                  <a
                    href={proof.photoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block overflow-hidden rounded border border-zinc-200"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={proof.photoUrl}
                      alt={proof.phase}
                      className="max-h-40 w-full object-cover"
                    />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {order.notes && (
        <div className="mt-6 border-t border-zinc-100 pt-4">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            Notes
          </p>
          <p className="mt-1 text-sm text-zinc-600">{order.notes}</p>
        </div>
      )}
    </div>
  );
}
