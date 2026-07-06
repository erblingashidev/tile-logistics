import {
  getTilePalletSpec,
  inferPresetIdFromDimensions,
  KG_PER_TILE_PALLET_DEFAULT,
  M2_PER_PALLET_DEFAULT,
  normalizeOrderUnit,
  type OrderUnit,
  type TileSpecOptions,
  tileFaceAreaM2,
} from "./constants";
import {
  calculateLineLogistics,
  isUsablePalletSpec,
  type ProductPalletSpec,
} from "./product-pallet-spec";

export type { ProductPalletSpec };

export type { TileSpecOptions, OrderUnit };

function parseWeightNumber(value: string): number {
  const trimmed = value.trim().replace(",", ".");
  return Number(trimmed) || 0;
}

/** Parse pack weight from product names like "H30 GEL 25KG" or "ARDEX G 10 anthrazit-5 kg". */
export function parseUnitWeightKgFromName(productName: string): number | null {
  const name = productName.trim();
  if (!name) return null;

  const patterns = [
    /\(\s*(\d+(?:[.,]\d+)?)\s*kg\s*\)/i,
    /(?:^|[\s(-])(\d+(?:[.,]\d+)?)\s*kg\b/i,
  ];

  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (!match) continue;
    const kg = parseWeightNumber(match[1]);
    if (kg > 0 && kg <= 1000) return kg;
  }

  return null;
}

export function calculateWeightBasedPieces(
  totalWeightKg: number,
  unitWeightKg: number | null
): {
  calculatedPieces: number;
  unitWeightKg: number | null;
  note?: string;
} {
  if (!unitWeightKg || unitWeightKg <= 0) {
    return {
      calculatedPieces: 0,
      unitWeightKg: null,
      note:
        "Add unit weight in the product name (e.g. 25 kg) to calculate pieces.",
    };
  }
  if (totalWeightKg <= 0) {
    return { calculatedPieces: 0, unitWeightKg, note: "Enter total kg." };
  }
  return {
    calculatedPieces: Math.ceil(totalWeightKg / unitWeightKg),
    unitWeightKg,
  };
}

export interface WeightLineCalculation {
  totalWeightKg: number;
  unitWeightKg: number | null;
  calculatedPieces: number;
  note?: string;
}

export function calculateWeightLine(
  totalWeightKg: number,
  productName: string
): WeightLineCalculation {
  const unitWeightKg = parseUnitWeightKgFromName(productName);
  const result = calculateWeightBasedPieces(totalWeightKg, unitWeightKg);
  return {
    totalWeightKg,
    unitWeightKg: result.unitWeightKg,
    calculatedPieces: result.calculatedPieces,
    note: result.note,
  };
}

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
  unit: OrderUnit | string;
  productName?: string;
  productId?: number;
  productEan?: string;
  tileWidthCm?: number;
  tileHeightCm?: number;
  tileThicknessCm?: number;
  quantityM2?: number;
  weightKg?: number;
  lengthM?: number;
  manualPallets?: number;
  manualPieces?: number;
  /** When linked to catalog with pallet specs, orders use these for weight/space. */
  catalogPallet?: ProductPalletSpec | null;
}

export interface EnrichedOrderItem {
  unit: OrderUnit;
  productName: string | null;
  tileWidthCm: number | null;
  tileHeightCm: number | null;
  tileThicknessCm: number | null;
  quantityM2: number | null;
  pieceCount: number | null;
  palletCount: number | null;
  weightKg: number | null;
  lengthM: number | null;
  calculatedPieces: number | null;
  calculatedPallets: number | null;
}

export interface OrderTotals {
  totalM2: number;
  totalPieces: number;
  totalPallets: number;
  totalWeightKg: number;
  /** Pallet slots on truck (accounts for oversized pallets). Falls back to totalPallets when omitted. */
  totalTruckPalletSlots?: number;
}

/** Weight scales with m² — never charge a full pallet when the load is a fraction of a pallet. */
export function weightKgFromM2(
  quantityM2: number,
  kgPerPallet: number,
  m2PerPallet: number
): number {
  if (quantityM2 <= 0) return 0;
  const m2pp = m2PerPallet > 0 ? m2PerPallet : M2_PER_PALLET_DEFAULT;
  const kgpp = kgPerPallet > 0 ? kgPerPallet : KG_PER_TILE_PALLET_DEFAULT;
  return (quantityM2 / m2pp) * kgpp;
}

export function kgPerM2FromPalletSpec(
  kgPerPallet: number,
  m2PerPallet: number
): number {
  const m2pp = m2PerPallet > 0 ? m2PerPallet : M2_PER_PALLET_DEFAULT;
  const kgpp = kgPerPallet > 0 ? kgPerPallet : KG_PER_TILE_PALLET_DEFAULT;
  return m2pp > 0 ? kgpp / m2pp : 0;
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
    unit?: string | null;
    productType?: string | null;
    productName?: string | null;
    tileWidthCm?: number | null;
    tileHeightCm?: number | null;
    quantityM2?: number | null;
    weightKg?: number | null;
    lengthM?: number | null;
    pieceCount?: number | null;
  }>
): string {
  if (items.length === 0) return "—";

  return items
    .map((item) => {
      const unit = normalizeOrderUnit(item.unit ?? item.productType);
      const name = item.productName?.trim() || "Product";
      const size =
        unit === "m2" && item.tileWidthCm && item.tileHeightCm
          ? ` ${item.tileWidthCm}×${item.tileHeightCm}`
          : "";
      if (unit === "m2" && item.quantityM2 != null) {
        return `${name}${size} · ${formatM2(item.quantityM2)} m²`;
      }
      if (unit === "kg" && item.weightKg != null) {
        const pieces =
          item.pieceCount != null ? ` · ${item.pieceCount} pcs` : "";
        return `${name} · ${item.weightKg.toFixed(0)} kg${pieces}`;
      }
      if (unit === "piece" && item.pieceCount != null) {
        return `${name} · ${item.pieceCount} pcs`;
      }
      if (unit === "meter" && item.lengthM != null) {
        return `${name} · ${item.lengthM} m`;
      }
      return `${name}${size}`;
    })
    .join("; ");
}

export function enrichOrderItem(item: OrderItemInput): EnrichedOrderItem {
  const unit = normalizeOrderUnit(item.unit);

  if (unit === "m2") {
    const m2 = item.quantityM2 ?? 0;

    if (isUsablePalletSpec(item.catalogPallet)) {
      const line = calculateLineLogistics(m2, item.catalogPallet, {
        manualPieces: item.manualPieces,
        manualPallets: item.manualPallets,
      });
      return {
        unit,
        productName: item.productName?.trim() || null,
        tileWidthCm: item.tileWidthCm ?? null,
        tileHeightCm: item.tileHeightCm ?? null,
        tileThicknessCm: item.tileThicknessCm ?? null,
        quantityM2: m2,
        pieceCount: line.pieceCount,
        palletCount: line.palletCount,
        weightKg: line.weightKg > 0 ? line.weightKg : null,
        lengthM: null,
        calculatedPieces: line.calculatedPieces,
        calculatedPallets: line.calculatedPallets,
      };
    }

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

    const weightKg = weightKgFromM2(m2, line.kgPerPallet, line.m2PerPallet);

    return {
      unit,
      productName: item.productName?.trim() || null,
      tileWidthCm: w,
      tileHeightCm: h,
      tileThicknessCm: specOptions.manualThicknessCm ?? null,
      quantityM2: m2,
      pieceCount,
      palletCount,
      weightKg,
      lengthM: null,
      calculatedPieces: line.calculatedPieces,
      calculatedPallets: line.calculatedPallets,
    };
  }

  if (unit === "kg") {
    const weightKg = item.weightKg ?? 0;
    const weightLine = calculateWeightLine(weightKg, item.productName ?? "");
    const calculatedPieces = weightLine.calculatedPieces;
    const pieceCount =
      item.manualPieces != null && item.manualPieces >= 0
        ? item.manualPieces
        : calculatedPieces > 0
          ? calculatedPieces
          : null;

    return {
      unit,
      productName: item.productName?.trim() || null,
      tileWidthCm: null,
      tileHeightCm: null,
      tileThicknessCm: null,
      quantityM2: null,
      pieceCount,
      palletCount: null,
      weightKg,
      lengthM: null,
      calculatedPieces: calculatedPieces > 0 ? calculatedPieces : null,
      calculatedPallets: null,
    };
  }

  if (unit === "meter") {
    const lengthM = item.lengthM ?? 0;
    return {
      unit,
      productName: item.productName?.trim() || null,
      tileWidthCm: null,
      tileHeightCm: null,
      tileThicknessCm: null,
      quantityM2: null,
      pieceCount: lengthM > 0 ? 1 : null,
      palletCount: null,
      weightKg: null,
      lengthM: lengthM > 0 ? lengthM : null,
      calculatedPieces: null,
      calculatedPallets: null,
    };
  }

  const pieceCount =
    item.manualPieces != null && item.manualPieces >= 0
      ? item.manualPieces
      : null;

  return {
    unit,
    productName: item.productName?.trim() || null,
    tileWidthCm: null,
    tileHeightCm: null,
    tileThicknessCm: null,
    quantityM2: null,
    pieceCount,
    palletCount: null,
    weightKg: item.weightKg ?? null,
    lengthM: null,
    calculatedPieces: null,
    calculatedPallets: null,
  };
}

export function calculateOrderTotals(items: OrderItemInput[]): OrderTotals {
  let totalM2 = 0;
  let totalPieces = 0;
  let totalPallets = 0;
  let totalWeightKg = 0;
  let totalTruckPalletSlots = 0;

  for (const item of items) {
    const enriched = enrichOrderItem(item);
    const unit = normalizeOrderUnit(item.unit);

    if (unit === "m2") {
      totalM2 += enriched.quantityM2 ?? 0;
      totalPieces += enriched.pieceCount ?? 0;
      totalPallets += enriched.palletCount ?? 0;

      if (isUsablePalletSpec(item.catalogPallet)) {
        const line = calculateLineLogistics(
          item.quantityM2 ?? 0,
          item.catalogPallet,
          {
            manualPieces: item.manualPieces,
            manualPallets: item.manualPallets,
          }
        );
        totalWeightKg += line.weightKg;
        totalTruckPalletSlots += line.truckPalletSlots;
      } else {
        const w = item.tileWidthCm ?? 60;
        const h = item.tileHeightCm ?? 60;
        const specOptions = tileSpecOptionsForItem(item);
        const m2 = item.quantityM2 ?? 0;
        const line = calculateTileLine(w, h, m2, specOptions);
        totalWeightKg += weightKgFromM2(
          m2,
          line.kgPerPallet,
          line.m2PerPallet
        );
        totalTruckPalletSlots += enriched.palletCount ?? 0;
      }
    } else if (unit === "kg") {
      totalWeightKg += enriched.weightKg ?? 0;
      totalPieces += enriched.pieceCount ?? 0;
    } else {
      totalPieces += enriched.pieceCount ?? 0;
      totalWeightKg += enriched.weightKg ?? 0;
    }
  }

  return {
    totalM2,
    totalPieces,
    totalPallets: Math.ceil(totalPallets),
    totalWeightKg,
    totalTruckPalletSlots: Math.ceil(totalTruckPalletSlots),
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
  const usedPallets = existingOrders.reduce(
    (s, o) => s + (o.totalTruckPalletSlots || o.totalPallets),
    0
  );
  const usedWeightKg = existingOrders.reduce((s, o) => s + o.totalWeightKg, 0);

  const newSlots = newOrder.totalTruckPalletSlots || newOrder.totalPallets;
  const nextPallets = usedPallets + newSlots;
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
