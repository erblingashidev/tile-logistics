/**
 * Partial shipment progress — ordered totals vs qty already delivered,
 * plus active partial load commitment from the warehouse picker.
 */

export type ShipmentQty = {
  pallets: number;
  m2: number;
  pieces: number;
};

export type OrderShipmentProgress = {
  ordered: ShipmentQty;
  /** Qty confirmed delivered to the customer. */
  sent: ShipmentQty;
  /**
   * Qty the picker confirmed as a partial load on the current trip
   * (not yet customer-delivered). Null = full remaining on truck / no partial load.
   */
  onTruck: ShipmentQty | null;
  /**
   * Still available to put on another truck:
   * ordered − sent − onTruck.
   */
  remaining: ShipmentQty;
  /** ordered − sent (includes what's already on this truck). */
  remainingUndelivered: ShipmentQty;
  isFullyDelivered: boolean;
  hasPartialShipments: boolean;
  /** Picker declared this trip is only part of the order. */
  isPartialLoad: boolean;
  shipmentCount: number;
};

type ProofLike = {
  phase: string;
  capturedAt?: string;
  sentPallets?: number | null;
  sentM2?: number | null;
  sentPieces?: number | null;
};

const SHIPMENT_PHASES = new Set(["partial_delivery", "delivered"]);

export function sumSentFromProofs(proofs: ProofLike[]): ShipmentQty {
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

/**
 * Latest `loaded` proof with sentPallets that has not yet been followed by a
 * customer shipment proof (partial_delivery / delivered).
 */
export function getActivePartialLoad(proofs: ProofLike[]): ShipmentQty | null {
  const sorted = [...proofs].sort((a, b) =>
    String(a.capturedAt ?? "").localeCompare(String(b.capturedAt ?? ""))
  );
  let lastPartialLoad: ProofLike | null = null;
  for (const p of sorted) {
    if (p.phase === "loaded" && p.sentPallets != null && Number(p.sentPallets) > 0) {
      lastPartialLoad = p;
    }
    if (SHIPMENT_PHASES.has(p.phase)) {
      lastPartialLoad = null;
    }
  }
  if (!lastPartialLoad) return null;
  return {
    pallets: round1(Number(lastPartialLoad.sentPallets) || 0),
    m2: round1(Number(lastPartialLoad.sentM2) || 0),
    pieces: Math.round(Number(lastPartialLoad.sentPieces) || 0),
  };
}

export function computeShipmentProgress(
  order: {
    totalPallets: number;
    totalM2: number;
    totalPieces: number;
    status?: string;
  },
  proofs: ProofLike[]
): OrderShipmentProgress {
  const ordered: ShipmentQty = {
    pallets: Number(order.totalPallets) || 0,
    m2: Number(order.totalM2) || 0,
    pieces: Number(order.totalPieces) || 0,
  };
  const shipmentProofs = proofs.filter((p) => SHIPMENT_PHASES.has(p.phase));
  const sentRaw = sumSentFromProofs(proofs);
  const hasPartialLoadHistory = proofs.some(
    (p) => p.phase === "loaded" && p.sentPallets != null && Number(p.sentPallets) > 0
  );
  const hasPartialDelivery = shipmentProofs.some(
    (p) => p.phase === "partial_delivery"
  );

  // Legacy full delivery with no qty recorded → treat as fully sent.
  const legacyFull =
    order.status === "delivered" ||
    shipmentProofs.some((p) => p.phase === "delivered" && p.sentPallets == null);

  if (legacyFull && sentRaw.pallets === 0 && sentRaw.m2 === 0 && sentRaw.pieces === 0) {
    return {
      ordered,
      sent: { ...ordered },
      onTruck: null,
      remaining: { pallets: 0, m2: 0, pieces: 0 },
      remainingUndelivered: { pallets: 0, m2: 0, pieces: 0 },
      isFullyDelivered: true,
      hasPartialShipments: hasPartialDelivery || hasPartialLoadHistory,
      isPartialLoad: false,
      shipmentCount: Math.max(1, shipmentProofs.length),
    };
  }

  const sent: ShipmentQty = {
    pallets: round1(sentRaw.pallets),
    m2: round1(sentRaw.m2),
    pieces: Math.round(sentRaw.pieces),
  };

  const remainingUndelivered: ShipmentQty = {
    pallets: Math.max(0, round1(ordered.pallets - sent.pallets)),
    m2: Math.max(0, round1(ordered.m2 - sent.m2)),
    pieces: Math.max(0, Math.round(ordered.pieces - sent.pieces)),
  };

  const onTruck = getActivePartialLoad(proofs);
  const remaining: ShipmentQty = {
    pallets: Math.max(
      0,
      round1(remainingUndelivered.pallets - (onTruck?.pallets ?? 0))
    ),
    m2: Math.max(0, round1(remainingUndelivered.m2 - (onTruck?.m2 ?? 0))),
    pieces: Math.max(
      0,
      Math.round(remainingUndelivered.pieces - (onTruck?.pieces ?? 0))
    ),
  };

  const isFullyDelivered =
    order.status === "delivered" ||
    (remainingUndelivered.pallets <= 0.05 &&
      remainingUndelivered.m2 <= 0.05 &&
      remainingUndelivered.pieces <= 0);

  return {
    ordered,
    sent,
    onTruck,
    remaining,
    remainingUndelivered,
    isFullyDelivered,
    hasPartialShipments: hasPartialDelivery || hasPartialLoadHistory || Boolean(onTruck),
    isPartialLoad: Boolean(onTruck),
    shipmentCount: shipmentProofs.length + (onTruck ? 1 : 0),
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Validate a partial send/load against remaining capacity. */
export function validatePartialSend(
  remaining: ShipmentQty,
  send: { pallets?: number | null; m2?: number | null; pieces?: number | null },
  opts?: { action?: "deliver" | "load" }
): { ok: true; sent: ShipmentQty } | { ok: false; error: string } {
  const action = opts?.action ?? "deliver";
  const pallets = Number(send.pallets);
  if (!Number.isFinite(pallets) || pallets <= 0) {
    return {
      ok: false,
      error:
        action === "load"
          ? "Enter how many pallets you are loading now."
          : "Enter how many pallets you are delivering now.",
    };
  }
  if (pallets > remaining.pallets + 0.05) {
    return {
      ok: false,
      error: `Only ${remaining.pallets} pallets left on this order.`,
    };
  }

  let m2 = Number(send.m2);
  if (!Number.isFinite(m2) || m2 < 0) {
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

  const leavesRemainder =
    remaining.pallets - pallets > 0.05 ||
    remaining.m2 - m2 > 0.05 ||
    remaining.pieces - pieces > 0;
  if (!leavesRemainder) {
    return {
      ok: false,
      error:
        action === "load"
          ? "That is the full remaining qty — use full load instead."
          : "That is the full remaining qty — use full delivery instead.",
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
