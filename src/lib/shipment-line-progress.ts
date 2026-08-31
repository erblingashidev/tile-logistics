/**
 * Per-product shipment qty for partial deliveries.
 * Native unit per line (m² / pieces·bags / kg / m); rollups feed order-level sent*.
 */

import { normalizeOrderUnit, type OrderUnit } from "@/lib/constants";
import { isLogisticsLine } from "@/lib/order-lines/classification";
import type { ShipmentQty } from "@/lib/shipment-progress";

export type OrderItemLike = {
  id: number;
  unit?: string | null;
  productName?: string | null;
  productEan?: string | null;
  lineKind?: string | null;
  quantityM2?: number | null;
  pieceCount?: number | null;
  palletCount?: number | null;
  calculatedPallets?: number | null;
  weightKg?: number | null;
  lengthM?: number | null;
};

export type ProofLineSentLike = {
  orderItemId: number;
  quantity: number;
};

export type ProofLineInput = {
  orderItemId: number;
  /** Send the full remaining qty for this line. */
  sentFully?: boolean;
  /** Qty in the line's native unit (required when not sentFully). */
  quantity?: number;
};

export type LineShipmentProgress = {
  orderItemId: number;
  productName: string;
  productEan: string | null;
  unit: OrderUnit;
  unitLabel: string;
  ordered: number;
  sent: number;
  remaining: number;
  orderedPallets: number;
  orderedPieces: number;
  orderedM2: number;
};

export type ResolvedProofLine = {
  orderItemId: number;
  quantity: number;
  unit: OrderUnit;
  sentFully: boolean;
  sentM2: number;
  sentPieces: number;
  sentPallets: number;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function roundQty(unit: OrderUnit, n: number): number {
  if (unit === "piece") return Math.round(n);
  if (unit === "m2") return Math.round(n * 100) / 100;
  return round1(n);
}

export function unitLabelForItem(item: OrderItemLike): string {
  const unit = normalizeOrderUnit(item.unit);
  const name = (item.productName ?? "").toLowerCase();
  if (unit === "m2") return "m²";
  if (unit === "kg") return "kg";
  if (unit === "meter") return "m";
  if (/\b(thas|thasë|thase|pako|bag|bags|çanta|canta)\b/i.test(name)) {
    return "bags";
  }
  if (/\b(cope|copë|pcs|pieces|tk)\b/i.test(name)) return "pcs";
  return "pcs";
}

/** Ordered qty in the line's native shipping unit. */
export function lineNativeOrdered(item: OrderItemLike): {
  unit: OrderUnit;
  qty: number;
  unitLabel: string;
} {
  const unit = normalizeOrderUnit(item.unit);
  const unitLabel = unitLabelForItem(item);
  if (unit === "m2") {
    return { unit, qty: Number(item.quantityM2) || 0, unitLabel };
  }
  if (unit === "kg") {
    return { unit, qty: Number(item.weightKg) || 0, unitLabel };
  }
  if (unit === "meter") {
    return { unit, qty: Number(item.lengthM) || 0, unitLabel };
  }
  return { unit: "piece", qty: Number(item.pieceCount) || 0, unitLabel };
}

function lineOrderedPallets(item: OrderItemLike): number {
  return (
    Number(item.palletCount) ||
    Number(item.calculatedPallets) ||
    0
  );
}

function lineOrderedPieces(item: OrderItemLike): number {
  return Number(item.pieceCount) || 0;
}

function lineOrderedM2(item: OrderItemLike): number {
  return Number(item.quantityM2) || 0;
}

export function computeLineShipmentProgress(
  items: OrderItemLike[],
  priorSent: ProofLineSentLike[]
): LineShipmentProgress[] {
  const sentByItem = new Map<number, number>();
  for (const row of priorSent) {
    sentByItem.set(
      row.orderItemId,
      (sentByItem.get(row.orderItemId) ?? 0) + (Number(row.quantity) || 0)
    );
  }

  return items
    .filter((item) => isLogisticsLine(item) && item.id > 0)
    .map((item) => {
      const native = lineNativeOrdered(item);
      const sent = roundQty(native.unit, sentByItem.get(item.id) ?? 0);
      const remaining = Math.max(0, roundQty(native.unit, native.qty - sent));
      return {
        orderItemId: item.id,
        productName: item.productName?.trim() || item.productEan || "Product",
        productEan: item.productEan ?? null,
        unit: native.unit,
        unitLabel: native.unitLabel,
        ordered: native.qty,
        sent,
        remaining,
        orderedPallets: lineOrderedPallets(item),
        orderedPieces: lineOrderedPieces(item),
        orderedM2: lineOrderedM2(item),
      };
    })
    .filter((line) => line.ordered > 0);
}

function rollupLineSend(
  line: LineShipmentProgress,
  sentQty: number
): Pick<ResolvedProofLine, "sentM2" | "sentPieces" | "sentPallets"> {
  const ordered = line.ordered > 0 ? line.ordered : 0;
  const ratio = ordered > 0 ? Math.min(1, sentQty / ordered) : 0;

  if (line.unit === "m2") {
    return {
      sentM2: roundQty("m2", sentQty),
      sentPieces: Math.round(line.orderedPieces * ratio),
      sentPallets: round1(line.orderedPallets * ratio),
    };
  }
  if (line.unit === "piece") {
    return {
      sentM2: 0,
      sentPieces: Math.round(sentQty),
      sentPallets: 0,
    };
  }
  if (line.unit === "kg") {
    return {
      sentM2: 0,
      sentPieces: Math.round(line.orderedPieces * ratio),
      sentPallets: 0,
    };
  }
  return {
    sentM2: 0,
    sentPieces: Math.round(line.orderedPieces * ratio) || (sentQty > 0 ? 1 : 0),
    sentPallets: 0,
  };
}

/**
 * Resolve checklist selections into per-line rows + order rollup.
 * Leaves remainder → partial; all remaining lines fully sent → full delivery.
 */
export function resolveShipmentFromLines(
  lines: LineShipmentProgress[],
  inputs: ProofLineInput[],
  opts?: { action?: "deliver" | "load" }
):
  | {
      ok: true;
      sent: ShipmentQty;
      proofLines: ResolvedProofLine[];
      isFullDelivery: boolean;
    }
  | { ok: false; error: string } {
  const action = opts?.action ?? "deliver";
  const byId = new Map(lines.map((l) => [l.orderItemId, l]));
  const proofLines: ResolvedProofLine[] = [];

  for (const input of inputs) {
    const line = byId.get(input.orderItemId);
    if (!line) {
      return { ok: false, error: "Unknown product line on this order." };
    }
    if (line.remaining <= 0) continue;

    let qty: number;
    let sentFully = Boolean(input.sentFully);
    if (sentFully) {
      qty = line.remaining;
    } else {
      qty = Number(input.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        return {
          ok: false,
          error: `Enter how much of “${line.productName}” was sent (${line.unitLabel}).`,
        };
      }
      qty = roundQty(line.unit, qty);
      if (qty > line.remaining + 0.001) {
        return {
          ok: false,
          error: `Only ${line.remaining} ${line.unitLabel} left for “${line.productName}”.`,
        };
      }
      if (Math.abs(qty - line.remaining) <= 0.001) {
        sentFully = true;
        qty = line.remaining;
      }
    }

    const rollup = rollupLineSend(line, qty);
    proofLines.push({
      orderItemId: line.orderItemId,
      quantity: qty,
      unit: line.unit,
      sentFully,
      ...rollup,
    });
  }

  if (proofLines.length === 0) {
    return {
      ok: false,
      error:
        action === "load"
          ? "Check at least one product and enter how much you are loading."
          : "Check at least one product and enter how much you are delivering.",
    };
  }

  const sent: ShipmentQty = {
    pallets: round1(proofLines.reduce((s, l) => s + l.sentPallets, 0)),
    m2: roundQty(
      "m2",
      proofLines.reduce((s, l) => s + l.sentM2, 0)
    ),
    pieces: Math.round(proofLines.reduce((s, l) => s + l.sentPieces, 0)),
  };

  if (sent.pallets <= 0 && sent.m2 <= 0 && sent.pieces <= 0) {
    return {
      ok: false,
      error: "Sent quantity must be greater than zero.",
    };
  }

  const remainingAfter = lines.map((line) => {
    const used = proofLines.find((p) => p.orderItemId === line.orderItemId);
    const left = used
      ? Math.max(0, roundQty(line.unit, line.remaining - used.quantity))
      : line.remaining;
    return left;
  });
  const isFullDelivery = remainingAfter.every((left) => left <= 0.001);

  return { ok: true, sent, proofLines, isFullDelivery };
}
