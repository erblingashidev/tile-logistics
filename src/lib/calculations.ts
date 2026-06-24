import {
  getKgPerPalletForTile,
  getTilePalletSpec,
  inferPresetIdFromDimensions,
  type TileSpecOptions,
  tileFaceAreaM2,
} from "./constants";

export type { TileSpecOptions };

export function tileSpecOptionsForItem(item: {
  tileWidthCm?: number;
  tileHeightCm?: number;
  tileThicknessCm?: number | null;
}): TileSpecOptions {
  const w = item.tileWidthCm ?? 60;
  const h = item.tileHeightCm ?? 60;
  const manualThicknessCm =
    item.tileThicknessCm != null && item.tileThicknessCm > 0
      ? item.tileThicknessCm
      : null;
  const presetId = inferPresetIdFromDimensions(w, h, manualThicknessCm);
  return { presetId, manualThicknessCm };
}

export function tileAreaM2(widthCm: number, heightCm: number): number {
  return tileFaceAreaM2(widthCm, heightCm);
}

export function calculateTilePieces(
  quantityM2: number,
  widthCm: number,
  heightCm: number
): number {
  const area = tileAreaM2(widthCm, heightCm);
  if (area <= 0) return 0;
  return Math.ceil(quantityM2 / area);
}

export function calculatePalletsFromM2(
  quantityM2: number,
  widthCm?: number,
  heightCm?: number,
  options: TileSpecOptions = {}
): {
  exact: number;
  rounded: number;
  m2PerPallet: number;
  piecesPerPallet: number;
  kgPerPallet: number;
} {
  const w = widthCm ?? 60;
  const h = heightCm ?? 60;
  const spec = getTilePalletSpec(w, h, options);
  const exact = spec.m2PerPallet > 0 ? quantityM2 / spec.m2PerPallet : 0;
  return {
    exact,
    rounded: Math.ceil(exact),
    m2PerPallet: spec.m2PerPallet,
    piecesPerPallet: spec.piecesPerPallet,
    kgPerPallet: spec.kgPerPallet,
  };
}

export interface TileLineCalculation {
  faceLabel: string;
  manualThicknessCm?: number;
  quantityM2: number;
  m2PerPallet: number;
  piecesPerPallet: number;
  kgPerPallet: number;
  calculatedPieces: number;
  calculatedPallets: number;
  standardLabel: string;
  note?: string;
}

export function calculateTileLine(
  widthCm: number,
  heightCm: number,
  quantityM2: number,
  options: TileSpecOptions = {}
): TileLineCalculation {
  const spec = getTilePalletSpec(widthCm, heightCm, options);
  const pallets = calculatePalletsFromM2(quantityM2, widthCm, heightCm, options);
  const calculatedPieces = calculateTilePieces(quantityM2, widthCm, heightCm);
  const manualThicknessCm =
    options.manualThicknessCm != null && options.manualThicknessCm > 0
      ? options.manualThicknessCm
      : undefined;

  let note: string | undefined;
  if (spec.adjustedForThickness && manualThicknessCm != null) {
    note = `Height ${(manualThicknessCm * 10).toFixed(0)} mm — pallet count adjusted vs ${spec.label}.`;
  } else if (!spec.standardId) {
    note =
      "No exact standard for these dimensions — using estimated pallet capacity.";
  }

  return {
    faceLabel: `${widthCm}×${heightCm} cm`,
    manualThicknessCm,
    quantityM2,
    m2PerPallet: pallets.m2PerPallet,
    piecesPerPallet: pallets.piecesPerPallet,
    kgPerPallet: pallets.kgPerPallet,
    calculatedPieces,
    calculatedPallets: pallets.rounded,
    standardLabel: spec.label,
    note,
  };
}

export interface OrderItemInput {
  productType: "tile" | "adhesive";
  productName?: string;
  tileWidthCm?: number;
  tileHeightCm?: number;
  tileThicknessCm?: number;
  quantityM2?: number;
  weightKg?: number;
  manualPallets?: number;
  manualPieces?: number;
}

export interface EnrichedOrderItem {
  productType: string;
  productName: string | null;
  tileWidthCm: number | null;
  tileHeightCm: number | null;
  tileThicknessCm: number | null;
  quantityM2: number | null;
  pieceCount: number | null;
  palletCount: number | null;
  weightKg: number | null;
  calculatedPieces: number | null;
  calculatedPallets: number | null;
}

export interface OrderTotals {
  totalM2: number;
  totalPieces: number;
  totalPallets: number;
  totalWeightKg: number;
}

/** Display m² without rounding to one decimal (e.g. 9.36 stays 9.36, not 9.4). */
export function formatM2(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const fixed = value.toFixed(2);
  if (fixed.endsWith(".00")) return fixed.slice(0, -3);
  if (fixed.endsWith("0")) return fixed.slice(0, -1);
  return fixed;
}

export function formatOrderProductSummary(
  items: Array<{
    productType: string;
    productName?: string | null;
    tileWidthCm?: number | null;
    tileHeightCm?: number | null;
    quantityM2?: number | null;
  }>
): string {
  if (items.length === 0) return "—";

  return items
    .map((item) => {
      const name =
        item.productName?.trim() ||
        (item.productType === "tile" ? "Tile" : "Adhesive");
      const size =
        item.tileWidthCm && item.tileHeightCm
          ? ` ${item.tileWidthCm}×${item.tileHeightCm}`
          : "";
      const qty =
        item.quantityM2 != null ? ` · ${formatM2(item.quantityM2)} m²` : "";
      return `${name}${size}${qty}`;
    })
    .join("; ");
}

export function enrichOrderItem(item: OrderItemInput): EnrichedOrderItem {
  if (item.productType === "tile") {
    const m2 = item.quantityM2 ?? 0;
    const w = item.tileWidthCm ?? 60;
    const h = item.tileHeightCm ?? 60;
    const specOptions = tileSpecOptionsForItem(item);
    const line = calculateTileLine(w, h, m2, specOptions);

    const pieceCount =
      item.manualPieces != null && item.manualPieces >= 0
        ? item.manualPieces
        : line.calculatedPieces;
    const palletCount =
      item.manualPallets != null && item.manualPallets >= 0
        ? item.manualPallets
        : line.calculatedPallets;

    return {
      productType: item.productType,
      productName: item.productName?.trim() || null,
      tileWidthCm: w,
      tileHeightCm: h,
      tileThicknessCm: specOptions.manualThicknessCm ?? null,
      quantityM2: m2,
      pieceCount,
      palletCount,
      weightKg: null,
      calculatedPieces: line.calculatedPieces,
      calculatedPallets: line.calculatedPallets,
    };
  }

  return {
    productType: item.productType,
    productName: item.productName?.trim() || null,
    tileWidthCm: null,
    tileHeightCm: null,
    tileThicknessCm: null,
    quantityM2: null,
    pieceCount: null,
    palletCount: null,
    weightKg: item.weightKg ?? 0,
    calculatedPieces: null,
    calculatedPallets: null,
  };
}

export function calculateOrderTotals(items: OrderItemInput[]): OrderTotals {
  let totalM2 = 0;
  let totalPieces = 0;
  let totalPallets = 0;
  let totalWeightKg = 0;

  for (const item of items) {
    const enriched = enrichOrderItem(item);
    if (item.productType === "tile") {
      const w = item.tileWidthCm ?? 60;
      const h = item.tileHeightCm ?? 60;
      const specOptions = tileSpecOptionsForItem(item);
      const kgPerPallet = getKgPerPalletForTile(w, h, specOptions);
      totalM2 += enriched.quantityM2 ?? 0;
      totalPieces += enriched.pieceCount ?? 0;
      totalPallets += enriched.palletCount ?? 0;
      totalWeightKg += (enriched.palletCount ?? 0) * kgPerPallet;
    } else {
      totalWeightKg += enriched.weightKg ?? 0;
    }
  }

  return {
    totalM2,
    totalPieces,
    totalPallets: Math.ceil(totalPallets),
    totalWeightKg,
  };
}

export interface CapacityUsage {
  usedPallets: number;
  usedWeightKg: number;
  maxPallets: number;
  maxWeightKg: number;
  palletsOk: boolean;
  weightOk: boolean;
  ok: boolean;
  weightWarning?: string;
  message?: string;
}

export function checkVehicleCapacity(
  existingOrders: OrderTotals[],
  newOrder: OrderTotals,
  maxPallets: number,
  maxWeightKg: number
): CapacityUsage {
  const usedPallets = existingOrders.reduce((s, o) => s + o.totalPallets, 0);
  const usedWeightKg = existingOrders.reduce((s, o) => s + o.totalWeightKg, 0);

  const nextPallets = usedPallets + newOrder.totalPallets;
  const nextWeight = usedWeightKg + newOrder.totalWeightKg;

  const palletsOk = nextPallets <= maxPallets;
  const weightOk = nextWeight <= maxWeightKg;

  let message: string | undefined;
  let weightWarning: string | undefined;

  if (!palletsOk) {
    message = `Exceeds pallet limit: ${nextPallets} pallets assigned but vehicle holds max ${maxPallets}.`;
  }

  if (!weightOk) {
    weightWarning = `Weight recommendation exceeded: ${nextWeight.toFixed(0)} kg vs suggested max ${maxWeightKg} kg. You can still assign.`;
  }

  return {
    usedPallets,
    usedWeightKg,
    maxPallets,
    maxWeightKg,
    palletsOk,
    weightOk,
    ok: palletsOk,
    weightWarning,
    message,
  };
}
