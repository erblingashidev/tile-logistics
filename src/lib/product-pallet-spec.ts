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
  return derivePackFields(input);
}

/** Pack → pallet auto-calc for tile lots (box, pallet, m²). */
export function derivePackFields(input: {
  tileWidthCm?: number | null;
  tileHeightCm?: number | null;
  piecesPerPack?: number | null;
  packsPerPallet?: number | null;
  piecesPerPallet?: number | null;
  m2PerPack?: number | null;
  m2PerPallet?: number | null;
  kgPerPack?: number | null;
  kgPerPallet?: number | null;
}) {
  const width = input.tileWidthCm ?? 0;
  const height = input.tileHeightCm ?? 0;
  const face = width > 0 && height > 0 ? tileFaceAreaM2(width, height) : 0;

  const piecesPerPack = input.piecesPerPack ?? 0;
  const packsPerPallet = input.packsPerPallet ?? 0;

  let piecesPerPallet = input.piecesPerPallet ?? 0;
  if (piecesPerPallet <= 0 && piecesPerPack > 0 && packsPerPallet > 0) {
    piecesPerPallet = piecesPerPack * packsPerPallet;
  }

  let m2PerPack = input.m2PerPack ?? 0;
  if (m2PerPack <= 0 && piecesPerPack > 0 && face > 0) {
    m2PerPack = Math.round(piecesPerPack * face * 10000) / 10000;
  }

  let m2PerPallet = input.m2PerPallet ?? 0;
  if (m2PerPallet <= 0 && piecesPerPallet > 0 && face > 0) {
    m2PerPallet = Math.round(piecesPerPallet * face * 100) / 100;
  }
  if (m2PerPallet <= 0 && packsPerPallet > 0 && m2PerPack > 0) {
    m2PerPallet = Math.round(packsPerPallet * m2PerPack * 100) / 100;
  }

  let kgPerPallet = input.kgPerPallet ?? 0;
  const kgPerPack = input.kgPerPack ?? 0;
  if (kgPerPallet <= 0 && packsPerPallet > 0 && kgPerPack > 0) {
    kgPerPallet = Math.round(packsPerPallet * kgPerPack * 10) / 10;
  }

  const m2PerPiece =
    piecesPerPallet > 0 && m2PerPallet > 0
      ? m2PerPallet / piecesPerPallet
      : face > 0
        ? face
        : 0;
  const kgPerPieceValue =
    piecesPerPallet > 0 && kgPerPallet > 0 ? kgPerPallet / piecesPerPallet : 0;

  return {
    piecesPerPack: piecesPerPack > 0 ? piecesPerPack : null,
    packsPerPallet: packsPerPallet > 0 ? packsPerPallet : null,
    piecesPerPallet: piecesPerPallet > 0 ? piecesPerPallet : null,
    m2PerPack: m2PerPack > 0 ? m2PerPack : null,
    m2PerPallet: m2PerPallet > 0 ? m2PerPallet : null,
    kgPerPallet: kgPerPallet > 0 ? kgPerPallet : null,
    kgPerPiece:
      kgPerPieceValue > 0 ? Math.round(kgPerPieceValue * 1000) / 1000 : null,
    m2PerPiece: m2PerPiece > 0 ? Math.round(m2PerPiece * 10000) / 10000 : null,
  };
}

/** Convert pallets / boxes / loose tiles into m² using catalog pack specs. */
export function quantityM2FromPackCounts(
  product: {
    tileWidthCm?: number | null;
    tileHeightCm?: number | null;
    piecesPerPack?: number | null;
    packsPerPallet?: number | null;
    piecesPerPallet?: number | null;
    m2PerPack?: number | null;
    m2PerPallet?: number | null;
  },
  counts: {
    fullPallets?: number;
    packs?: number;
    loosePieces?: number;
    quantityM2?: number;
  }
): { ok: true; quantityM2: number; fullPallets: number; loosePieces: number } | {
  ok: false;
  error: string;
} {
  if (counts.quantityM2 != null && counts.quantityM2 > 0) {
    const derived = derivePackFields(product);
    const m2pp = derived.m2PerPiece ?? 0;
    const piecesPerPallet = derived.piecesPerPallet ?? 0;
    const totalPieces =
      m2pp > 0 ? Math.round(counts.quantityM2 / m2pp) : 0;
    const fullPallets =
      piecesPerPallet > 0 ? Math.floor(totalPieces / piecesPerPallet) : 0;
    const loosePieces =
      piecesPerPallet > 0 ? totalPieces % piecesPerPallet : totalPieces;
    return {
      ok: true,
      quantityM2: Math.round(counts.quantityM2 * 100) / 100,
      fullPallets,
      loosePieces,
    };
  }

  const derived = derivePackFields(product);
  const fullPallets = Math.max(0, Number(counts.fullPallets) || 0);
  const packs = Math.max(0, Number(counts.packs) || 0);
  const loosePieces = Math.max(0, Number(counts.loosePieces) || 0);

  if (fullPallets <= 0 && packs <= 0 && loosePieces <= 0) {
    return {
      ok: false,
      error: "Enter pallets, boxes, loose tiles, or m².",
    };
  }

  const m2PerPallet = derived.m2PerPallet ?? 0;
  const m2PerPack = derived.m2PerPack ?? 0;
  const m2PerPiece = derived.m2PerPiece ?? 0;

  if (fullPallets > 0 && m2PerPallet <= 0) {
    return {
      ok: false,
      error: "Set m² per pallet (or size + pieces/boxes) on the product first.",
    };
  }
  if (packs > 0 && m2PerPack <= 0) {
    return {
      ok: false,
      error: "Set pieces per box and tile size on the product first.",
    };
  }
  if (loosePieces > 0 && m2PerPiece <= 0) {
    return {
      ok: false,
      error: "Set tile dimensions on the product first.",
    };
  }

  const quantityM2 =
    Math.round(
      (fullPallets * m2PerPallet + packs * m2PerPack + loosePieces * m2PerPiece) *
        100
    ) / 100;

  const piecesPerPallet = derived.piecesPerPallet ?? 0;
  const piecesPerPack = derived.piecesPerPack ?? 0;
  const totalPieces =
    fullPallets * piecesPerPallet + packs * piecesPerPack + loosePieces;
  const balPallets =
    piecesPerPallet > 0 ? Math.floor(totalPieces / piecesPerPallet) : fullPallets;
  const balLoose =
    piecesPerPallet > 0 ? totalPieces % piecesPerPallet : loosePieces;

  return {
    ok: true,
    quantityM2,
    fullPallets: balPallets,
    loosePieces: balLoose,
  };
}

export function buildFamilyKey(input: {
  productName?: string | null;
  tileWidthCm?: number | null;
  tileHeightCm?: number | null;
}): string | null {
  const w = input.tileWidthCm;
  const h = input.tileHeightCm;
  const name = input.productName?.trim().toLowerCase().replace(/\s+/g, " ");
  if (!name && !(w && h)) return null;
  const dim = w && h ? `${w}x${h}` : "na";
  const base = (name ?? "product").slice(0, 80);
  return `${dim}|${base}`;
}

/** Autogenerated lot barcode used when factory EAN is not unique per shade/batch. */
export function generateLotEan(prefix = "TL"): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 36 ** 3)
    .toString(36)
    .toUpperCase()
    .padStart(3, "0");
  return `${prefix}${stamp}${rand}`;
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
