import { listOrders } from "@/lib/services/orders";
import {
  computeShipmentProgress,
  type OrderShipmentProgress,
} from "@/lib/shipment-progress";

export type PartialDeliveryTrip = {
  proofId: number;
  capturedAt: string;
  employeeName: string;
  sentPallets: number;
  sentM2: number;
  sentPieces: number;
  notes: string | null;
  photoUrl: string | null;
};

export type PartialDeliveryReportRow = {
  id: number;
  invoiceNumber: string;
  customerName: string;
  region: string | null;
  location: string;
  orderDate: string;
  status: string;
  deliveryStageLabel: string;
  orderedPallets: number;
  orderedM2: number;
  sentPallets: number;
  sentM2: number;
  remainingPallets: number;
  remainingM2: number;
  remainingPieces: number;
  shipmentCount: number;
  isOpen: boolean;
  assignment: {
    vehicleName: string;
    plateNumber?: string;
    deliveryRound: number;
  } | null;
  trips: PartialDeliveryTrip[];
  lastPartialAt: string | null;
};

export type PartialDeliveriesReport = {
  orders: PartialDeliveryReportRow[];
  summary: {
    count: number;
    openCount: number;
    completedCount: number;
    totalOrderedPallets: number;
    totalSentPallets: number;
    totalRemainingPallets: number;
    totalTrips: number;
  };
};

function inDateRange(iso: string, dateFrom?: string, dateTo?: string): boolean {
  const day = iso.slice(0, 10);
  if (dateFrom && day < dateFrom) return false;
  if (dateTo && day > dateTo) return false;
  return true;
}

/**
 * Orders that had at least one partial delivery, with trip-level evidence.
 * `scope=open` = still has remaining qty; `all` = any history of partials.
 */
export async function getPartialDeliveriesReport(filters: {
  dateFrom?: string;
  dateTo?: string;
  scope?: "open" | "all";
  region?: string;
  search?: string;
}): Promise<PartialDeliveriesReport> {
  const scope = filters.scope ?? "open";
  const all = await listOrders({
    region: filters.region,
    search: filters.search,
    hideDelivered: false,
  });

  const rows: PartialDeliveryReportRow[] = [];

  for (const order of all) {
    const shipment: OrderShipmentProgress | undefined =
      "shipment" in order && order.shipment
        ? (order.shipment as OrderShipmentProgress)
        : computeShipmentProgress(order, order.proofs ?? []);
    if (!shipment?.hasPartialShipments) continue;

    const trips = (order.proofs ?? [])
      .filter((p) => p.phase === "partial_delivery")
      .map((p) => ({
        proofId: p.id as number,
        capturedAt: p.capturedAt,
        employeeName: p.employeeName,
        sentPallets: Number(p.sentPallets) || 0,
        sentM2: Number(p.sentM2) || 0,
        sentPieces: Number(p.sentPieces) || 0,
        notes: p.notes ?? null,
        photoUrl: p.photoUrl ?? null,
      }))
      .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));

    if (trips.length === 0) continue;

    const lastPartialAt = trips[trips.length - 1]?.capturedAt ?? null;
    const matchDate =
      inDateRange(order.orderDate, filters.dateFrom, filters.dateTo) ||
      trips.some((t) => inDateRange(t.capturedAt, filters.dateFrom, filters.dateTo));
    if ((filters.dateFrom || filters.dateTo) && !matchDate) continue;

    const isOpen =
      !shipment.isFullyDelivered &&
      order.status !== "delivered" &&
      order.status !== "cancelled" &&
      shipment.remaining.pallets > 0.05;

    if (scope === "open" && !isOpen) continue;

    rows.push({
      id: order.id,
      invoiceNumber: order.invoiceNumber,
      customerName: order.customerName,
      region: order.region ?? null,
      location: order.location,
      orderDate: order.orderDate,
      status: order.status,
      deliveryStageLabel: order.deliveryStageLabel ?? order.status,
      orderedPallets: shipment.ordered.pallets,
      orderedM2: shipment.ordered.m2,
      sentPallets: shipment.sent.pallets,
      sentM2: shipment.sent.m2,
      remainingPallets: shipment.remaining.pallets,
      remainingM2: shipment.remaining.m2,
      remainingPieces: shipment.remaining.pieces,
      shipmentCount: shipment.shipmentCount,
      isOpen,
      assignment: order.assignment
        ? {
            vehicleName: order.assignment.vehicleName,
            plateNumber: order.assignment.plateNumber,
            deliveryRound: order.assignment.deliveryRound,
          }
        : null,
      trips,
      lastPartialAt,
    });
  }

  rows.sort((a, b) => {
    if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
    return (b.lastPartialAt ?? "").localeCompare(a.lastPartialAt ?? "");
  });

  return {
    orders: rows,
    summary: {
      count: rows.length,
      openCount: rows.filter((r) => r.isOpen).length,
      completedCount: rows.filter((r) => !r.isOpen).length,
      totalOrderedPallets: rows.reduce((s, r) => s + r.orderedPallets, 0),
      totalSentPallets: rows.reduce((s, r) => s + r.sentPallets, 0),
      totalRemainingPallets: rows.reduce((s, r) => s + r.remainingPallets, 0),
      totalTrips: rows.reduce((s, r) => s + r.trips.length, 0),
    },
  };
}
