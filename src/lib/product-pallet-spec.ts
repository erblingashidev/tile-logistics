import { tileFaceAreaM2, normalizeOrderUnit } from "@/lib/constants";
import type { ProductRecord } from "@/lib/services/products";

/** Verified pallet profile stored on a catalog product. */
export interface ProductPalletSpec {
  m2PerPallet: number;
  piecesPerPallet: number;
  kgPerPallet: number;
  palletFootprintLengthCm?: number | null;
  palletFootprintWidthCm?: number | null;
  /** How many standard truck pallet slots one physical pallet uses. */
  palletSlots: number;
  source: "catalog";
  label: string;
}

export function isUsablePalletSpec(
  spec: Partial<ProductPalletSpec> | null | undefined
): spec is ProductPalletSpec {
  return (
    !!spec &&
    (spec.m2PerPallet ?? 0) > 0 &&
    (spec.piecesPerPallet ?? 0) > 0
  );
}

export function palletSpecFromProduct(
  product: ProductRecord | null | undefined
): ProductPalletSpec | null {
  if (!product) return null;
  const m2PerPallet = product.m2PerPallet ?? 0;
  const piecesPerPallet = product.piecesPerPallet ?? 0;
  if (m2PerPallet <= 0 || piecesPerPallet <= 0) return null;

  let kgPerPallet = product.kgPerPallet ?? 0;
  if (kgPerPallet <= 0 && product.unitWeightKg && product.piecesPerPallet) {
    kgPerPallet = product.unitWeightKg * product.piecesPerPallet;
  }

  return {
    m2PerPallet,
    piecesPerPallet,
    kgPerPallet,
    palletFootprintLengthCm: product.palletFootprintLengthCm,
    palletFootprintWidthCm: product.palletFootprintWidthCm,
    palletSlots: product.replacesStandardPallets ?? 1,
    source: "catalog",
    label: product.productName?.trim() || product.ean || "Catalog product",
  };
}

export function kgPerPiece(spec: ProductPalletSpec): number {
  return spec.kgPerPallet > 0 ? spec.kgPerPallet / spec.piecesPerPallet : 0;
}

export function m2PerPiece(spec: ProductPalletSpec): number {
  return spec.m2PerPallet / spec.piecesPerPallet;
}

export function derivePalletFields(input: {
  tileWidthCm?: number | null;
  tileHeightCm?: number | null;
  piecesPerPallet?: number | null;
  m2PerPallet?: number | null;
  kgPerPallet?: number | null;
}) {
  const pieces = input.piecesPerPallet ?? 0;
  const width = input.tileWidthCm ?? 0;
  const height = input.tileHeightCm ?? 0;
  const face = width > 0 && height > 0 ? tileFaceAreaM2(width, height) : 0;

  let m2PerPallet = input.m2PerPallet ?? 0;
  if (m2PerPallet <= 0 && pieces > 0 && face > 0) {
    m2PerPallet = Math.round(pieces * face * 100) / 100;
  }

  const kgPerPallet = input.kgPerPallet ?? 0;
  const m2PerPiece =
    pieces > 0 && m2PerPallet > 0 ? m2PerPallet / pieces : face > 0 ? face : 0;
  const kgPerPieceValue =
    pieces > 0 && kgPerPallet > 0 ? kgPerPallet / pieces : 0;

  return {
    m2PerPallet: m2PerPallet > 0 ? m2PerPallet : null,
    kgPerPiece: kgPerPieceValue > 0 ? Math.round(kgPerPieceValue * 1000) / 1000 : null,
    m2PerPiece: m2PerPiece > 0 ? Math.round(m2PerPiece * 10000) / 10000 : null,
  };
}

export interface LineLogistics {
  calculatedPieces: number;
  calculatedPallets: number;
  pieceCount: number;
  palletCount: number;
  weightKg: number;
  truckPalletSlots: number;
  m2PerPallet: number;
  piecesPerPallet: number;
  kgPerPallet: number;
  label: string;
}

export function calculateLineLogistics(
  quantityM2: number,
  spec: ProductPalletSpec,
  options?: { manualPieces?: number; manualPallets?: number }
): LineLogistics {
  const m2pp = m2PerPiece(spec);
  const calculatedPieces =
    m2pp > 0 ? Math.ceil(quantityM2 / m2pp) : 0;
  const exactPallets =
    spec.m2PerPallet > 0 ? quantityM2 / spec.m2PerPallet : 0;
  const calculatedPallets = Math.ceil(exactPallets);
  const pieceCount =
    options?.manualPieces != null && options.manualPieces >= 0
      ? options.manualPieces
      : calculatedPieces;
  const palletCount =
    options?.manualPallets != null && options.manualPallets >= 0
      ? options.manualPallets
      : calculatedPallets;
  const weightKg =
    spec.kgPerPallet > 0 && spec.m2PerPallet > 0
      ? (quantityM2 / spec.m2PerPallet) * spec.kgPerPallet
      : pieceCount * kgPerPiece(spec);

  return {
    calculatedPieces,
    calculatedPallets,
    pieceCount,
    palletCount,
    weightKg,
    truckPalletSlots: palletCount * spec.palletSlots,
    m2PerPallet: spec.m2PerPallet,
    piecesPerPallet: spec.piecesPerPallet,
    kgPerPallet: spec.kgPerPallet,
    label: spec.label,
  };
}

/** Apply catalog product to an order line form (client-safe). */
export function productToOrderItemDefaults(product: ProductRecord) {
  return {
    productId: product.id,
    productEan: product.ean ?? undefined,
    productName: product.productName ?? "",
    unit: normalizeOrderUnit(product.unit),
    tileWidthCm: product.tileWidthCm ?? undefined,
    tileHeightCm: product.tileHeightCm ?? undefined,
    tileThicknessCm: product.tileThicknessCm ?? undefined,
    thicknessOverride: product.tileThicknessCm != null,
    catalogStatus: product.status,
    catalogPallet: palletSpecFromProduct(product),
  };
}
