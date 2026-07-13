import { normalizeOrderUnit } from "@/lib/constants";

/** Max pieces on a normal truck for jumbo / heavy-lift tile formats. */
export const JUMBO_TILE_MAX_PIECES_STANDARD_TRUCK = 2;

/** Large tiles (>120×120 cm) with this many pieces or fewer can be hand-unloaded on Atego. */
export const LARGE_TILE_SMALL_QTY_MAX_PIECES = 3;

/** Tiles with both sides at least 120 cm (e.g. 120×120, 120×280). */
export function isLargeTileFormat(widthCm: number, heightCm: number): boolean {
  const min = Math.min(widthCm, heightCm);
  const max = Math.max(widthCm, heightCm);
  return min >= 120 && max >= 120;
}

/**
 * Jumbo formats (160×160, 120×280, 160×200, etc.) need the crane truck
 * when piece count exceeds JUMBO_TILE_MAX_PIECES_STANDARD_TRUCK.
 */
export function isJumboTileFormat(widthCm: number, heightCm: number): boolean {
  const min = Math.min(widthCm, heightCm);
  const max = Math.max(widthCm, heightCm);
  return max >= 160 || (min >= 120 && max >= 200);
}

export function jumboFormatLabel(widthCm: number, heightCm: number): string {
  const min = Math.min(widthCm, heightCm);
  const max = Math.max(widthCm, heightCm);
  return `${min}×${max} cm`;
}

export interface TileLineCargo {
  unit?: string | null;
  productType?: string | null;
  tileWidthCm?: number | null;
  tileHeightCm?: number | null;
  pieceCount?: number | null;
  calculatedPieces?: number | null;
  quantityM2?: number | null;
  productName?: string | null;
}

export interface OrderCargoAnalysis {
  requiresCrane: boolean;
  jumboLines: Array<{
    label: string;
    pieces: number;
    reason: string;
  }>;
  reasons: string[];
}

export function analyzeOrderCargo(
  items: TileLineCargo[]
): OrderCargoAnalysis {
  const jumboLines: OrderCargoAnalysis["jumboLines"] = [];
  const reasons: string[] = [];

  for (const item of items) {
    if (normalizeOrderUnit(item.unit ?? item.productType) !== "m2") continue;
    const w = item.tileWidthCm ?? 0;
    const h = item.tileHeightCm ?? 0;
    if (w <= 0 || h <= 0) continue;

    if (!isJumboTileFormat(w, h)) continue;

    const pieces =
      item.pieceCount ??
      item.calculatedPieces ??
      (item.quantityM2 ? Math.ceil(item.quantityM2) : 0);

    if (pieces <= JUMBO_TILE_MAX_PIECES_STANDARD_TRUCK) {
      reasons.push(
        `${jumboFormatLabel(w, h)}: ${pieces} pcs — OK on standard truck (≤${JUMBO_TILE_MAX_PIECES_STANDARD_TRUCK})`
      );
      continue;
    }

    jumboLines.push({
      label: item.productName?.trim() || jumboFormatLabel(w, h),
      pieces,
      reason: `${pieces} pieces of ${jumboFormatLabel(w, h)} — crane required (>${JUMBO_TILE_MAX_PIECES_STANDARD_TRUCK} pcs)`,
    });
  }

  if (jumboLines.length > 0) {
    reasons.push(
      ...jumboLines.map((l) => l.reason),
      "Assign to crane truck (Krani / Volvo) only"
    );
  }

  return {
    requiresCrane: jumboLines.length > 0,
    jumboLines,
    reasons,
  };
}
