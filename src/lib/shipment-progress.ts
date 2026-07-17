/**
 * Partial shipment progress — ordered totals vs qty already delivered.
 */

export type ShipmentQty = {
  pallets: number;
  m2: number;
  pieces: number;
};

export type OrderShipmentProgress = {
  ordered: ShipmentQty;
  sent: ShipmentQty;
  remaining: ShipmentQty;
  isFullyDelivered: boolean;
  hasPartialShipments: boolean;
  shipmentCount: number;
};

const SHIPMENT_PHASES = new Set(["partial_delivery", "delivered"]);

export function sumSentFromProofs(
  proofs: Array<{
    phase: string;
    sentPallets?: number | null;
    sentM2?: number | null;
    sentPieces?: number | null;
  }>
): ShipmentQty {
  return proofs
    .filter((p) => SHIPMENT_PHASES.has(p.phase))
    .reduce(
      (acc, p) => ({
        pallets: acc.pallets + (Number(p.sentPallets) || 0),
        m2: acc.m2 + (Number(p.sentM2) || 0),
        pieces: acc.pieces + (Number(p.sentPieces) || 0),
      }),
      { pallets: 0, m2: 0, pieces: 0 }
    );
}

export function computeShipmentProgress(
  order: {
    totalPallets: number;
    totalM2: number;
    totalPieces: number;
    status?: string;
  },
  proofs: Array<{
    phase: string;
    sentPallets?: number | null;
    sentM2?: number | null;
    sentPieces?: number | null;
  }>
): OrderShipmentProgress {
  const ordered: ShipmentQty = {
    pallets: Number(order.totalPallets) || 0,
    m2: Number(order.totalM2) || 0,
    pieces: Number(order.totalPieces) || 0,
  };
  const shipmentProofs = proofs.filter((p) => SHIPMENT_PHASES.has(p.phase));
  const sent = sumSentFromProofs(proofs);

  // Legacy full delivery with no qty recorded → treat as fully sent.
  const legacyFull =
    order.status === "delivered" ||
    shipmentProofs.some((p) => p.phase === "delivered" && p.sentPallets == null);

  if (legacyFull && sent.pallets === 0 && sent.m2 === 0 && sent.pieces === 0) {
    return {
      ordered,
      sent: { ...ordered },
      remaining: { pallets: 0, m2: 0, pieces: 0 },
      isFullyDelivered: true,
      hasPartialShipments: shipmentProofs.some((p) => p.phase === "partial_delivery"),
      shipmentCount: Math.max(1, shipmentProofs.length),
    };
  }

  const remaining: ShipmentQty = {
    pallets: Math.max(0, round1(ordered.pallets - sent.pallets)),
    m2: Math.max(0, round1(ordered.m2 - sent.m2)),
    pieces: Math.max(0, Math.round(ordered.pieces - sent.pieces)),
  };

  const isFullyDelivered =
    order.status === "delivered" ||
    (remaining.pallets <= 0.05 && remaining.m2 <= 0.05 && remaining.pieces <= 0);

  return {
    ordered,
    sent: {
      pallets: round1(sent.pallets),
      m2: round1(sent.m2),
      pieces: Math.round(sent.pieces),
    },
    remaining,
    isFullyDelivered,
    hasPartialShipments: shipmentProofs.some((p) => p.phase === "partial_delivery"),
    shipmentCount: shipmentProofs.length,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Validate a partial send against remaining capacity. */
export function validatePartialSend(
  remaining: ShipmentQty,
  send: { pallets?: number | null; m2?: number | null; pieces?: number | null }
): { ok: true; sent: ShipmentQty } | { ok: false; error: string } {
  const pallets = Number(send.pallets);
  if (!Number.isFinite(pallets) || pallets <= 0) {
    return { ok: false, error: "Enter how many pallets you are delivering now." };
  }
  if (pallets > remaining.pallets + 0.05) {
    return {
      ok: false,
      error: `Only ${remaining.pallets} pallets left on this order.`,
    };
  }

  let m2 = Number(send.m2);
  if (!Number.isFinite(m2) || m2 < 0) {
    // Scale m² from pallets when not provided.
    m2 =
      remaining.pallets > 0
        ? (pallets / remaining.pallets) * remaining.m2
        : 0;
  }
  if (m2 > remaining.m2 + 0.05) {
    m2 = remaining.m2;
  }

  let pieces = Number(send.pieces);
  if (!Number.isFinite(pieces) || pieces < 0) {
    pieces =
      remaining.pallets > 0
        ? Math.round((pallets / remaining.pallets) * remaining.pieces)
        : 0;
  }
  if (pieces > remaining.pieces) {
    pieces = remaining.pieces;
  }

  // Must leave something for a true partial.
  const leavesRemainder =
    remaining.pallets - pallets > 0.05 ||
    remaining.m2 - m2 > 0.05 ||
    remaining.pieces - pieces > 0;
  if (!leavesRemainder) {
    return {
      ok: false,
      error: "That is the full remaining qty — use full delivery instead.",
    };
  }

  return {
    ok: true,
    sent: {
      pallets: round1(pallets),
      m2: round1(m2),
      pieces: Math.round(pieces),
    },
  };
}
