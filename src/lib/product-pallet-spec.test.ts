import { describe, expect, it } from "vitest";
import {
  buildFamilyKey,
  derivePackFields,
  generateLotEan,
  quantityM2FromPackCounts,
} from "@/lib/product-pallet-spec";

/** Example from ops: 60×120, 2 tiles/box, 36 boxes/pallet → 72 tiles, ~51.84 m²/pallet */
const TILE_60X120 = {
  tileWidthCm: 60,
  tileHeightCm: 120,
  piecesPerPack: 2,
  packsPerPallet: 36,
};

describe("derivePackFields", () => {
  it("auto-calcs tiles/pallet and m²/pallet from box + size", () => {
    const d = derivePackFields(TILE_60X120);
    expect(d.piecesPerPallet).toBe(72);
    expect(d.m2PerPiece).toBe(0.72);
    expect(d.m2PerPack).toBe(1.44);
    expect(d.m2PerPallet).toBe(51.84);
  });

  it("keeps explicit m²/pallet when provided", () => {
    const d = derivePackFields({ ...TILE_60X120, m2PerPallet: 50 });
    expect(d.m2PerPallet).toBe(50);
    expect(d.piecesPerPallet).toBe(72);
  });

  it("returns nulls when insufficient input", () => {
    const d = derivePackFields({});
    expect(d.piecesPerPallet).toBeNull();
    expect(d.m2PerPallet).toBeNull();
  });

  it("fills all weights from kg per tile", () => {
    const d = derivePackFields({ ...TILE_60X120, unitWeightKg: 18 });
    expect(d.unitWeightKg).toBe(18);
    expect(d.kgPerPack).toBe(36);
    expect(d.kgPerPallet).toBe(1296);
    expect(d.routeReady).toBe(true);
  });

  it("fills piece and pallet weight from kg per box", () => {
    const d = derivePackFields({ ...TILE_60X120, kgPerPack: 36 });
    expect(d.unitWeightKg).toBe(18);
    expect(d.kgPerPallet).toBe(1296);
  });

  it("fills piece and box weight from kg per pallet", () => {
    const d = derivePackFields({ ...TILE_60X120, kgPerPallet: 1296 });
    expect(d.unitWeightKg).toBe(18);
    expect(d.kgPerPack).toBe(36);
  });

  it("infers boxes/pallet from tiles/pallet ÷ tiles/box", () => {
    const d = derivePackFields({
      tileWidthCm: 60,
      tileHeightCm: 120,
      piecesPerPack: 2,
      piecesPerPallet: 72,
    });
    expect(d.packsPerPallet).toBe(36);
    expect(d.m2PerPallet).toBe(51.84);
  });
});

describe("inferTileSizeFromName", () => {
  it("reads dimensions from product name", async () => {
    const { inferTileSizeFromName } = await import("@/lib/product-pallet-spec");
    expect(inferTileSizeFromName("NUANCE AVORIO 80X80")).toEqual({
      width: 80,
      height: 80,
    });
  });
});

describe("quantityM2FromPackCounts", () => {
  it("converts full pallets using pack profile", () => {
    const qty = quantityM2FromPackCounts(TILE_60X120, { fullPallets: 2 });
    expect(qty.ok).toBe(true);
    if (!qty.ok) return;
    expect(qty.quantityM2).toBe(103.68);
    expect(qty.fullPallets).toBe(2);
    expect(qty.loosePieces).toBe(0);
  });

  it("adds extra boxes and loose tiles", () => {
    const qty = quantityM2FromPackCounts(TILE_60X120, {
      fullPallets: 1,
      packs: 1,
      loosePieces: 1,
    });
    expect(qty.ok).toBe(true);
    if (!qty.ok) return;
    // 51.84 + 1.44 + 0.72 = 54
    expect(qty.quantityM2).toBe(54);
  });

  it("accepts direct m² and derives pallet breakdown", () => {
    const qty = quantityM2FromPackCounts(TILE_60X120, { quantityM2: 51.84 });
    expect(qty.ok).toBe(true);
    if (!qty.ok) return;
    expect(qty.quantityM2).toBe(51.84);
    expect(qty.fullPallets).toBe(1);
    expect(qty.loosePieces).toBe(0);
  });

  it("errors when no qty given", () => {
    const qty = quantityM2FromPackCounts(TILE_60X120, {});
    expect(qty.ok).toBe(false);
  });

  it("errors when pallets entered without pack profile", () => {
    const qty = quantityM2FromPackCounts({}, { fullPallets: 1 });
    expect(qty.ok).toBe(false);
    if (qty.ok) return;
    expect(qty.error).toMatch(/m² per pallet/i);
  });
});

describe("lot helpers", () => {
  it("builds a stable family key from name + size", () => {
    expect(
      buildFamilyKey({
        productName: "Marble Beige",
        tileWidthCm: 60,
        tileHeightCm: 120,
      })
    ).toBe("60x120|marble beige");
  });

  it("generates unique-looking lot barcodes", () => {
    const a = generateLotEan();
    const b = generateLotEan();
    expect(a).toMatch(/^TL[A-Z0-9]+$/);
    expect(a.length).toBeGreaterThanOrEqual(10);
    expect(a).not.toBe(b);
  });
});
