import { describe, expect, it } from "vitest";
import {
  computeLineShipmentProgress,
  resolveShipmentFromLines,
} from "@/lib/shipment-line-progress";

describe("shipment line progress", () => {
  const items = [
    {
      id: 1,
      unit: "m2",
      productName: "Tile A",
      quantityM2: 40,
      pieceCount: 80,
      palletCount: 2,
    },
    {
      id: 2,
      unit: "m2",
      productName: "Tile B",
      quantityM2: 20,
      pieceCount: 40,
      palletCount: 1,
    },
    {
      id: 3,
      unit: "piece",
      productName: "Cement thas",
      pieceCount: 4,
    },
  ];

  it("tracks remaining per product", () => {
    const lines = computeLineShipmentProgress(items, [
      { orderItemId: 3, quantity: 1 },
    ]);
    const bags = lines.find((l) => l.orderItemId === 3)!;
    expect(bags.ordered).toBe(4);
    expect(bags.sent).toBe(1);
    expect(bags.remaining).toBe(3);
    expect(bags.unitLabel).toBe("bags");
  });

  it("allows full line + custom qty on another", () => {
    const lines = computeLineShipmentProgress(items, []);
    const resolved = resolveShipmentFromLines(lines, [
      { orderItemId: 2, sentFully: true },
      { orderItemId: 3, quantity: 3 },
    ]);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.isFullDelivery).toBe(false);
    expect(resolved.proofLines).toHaveLength(2);
    const bags = resolved.proofLines.find((l) => l.orderItemId === 3)!;
    expect(bags.quantity).toBe(3);
    expect(bags.sentPieces).toBe(3);
    expect(resolved.sent.m2).toBe(20);
  });

  it("marks full delivery when all remaining lines are fully sent", () => {
    const lines = computeLineShipmentProgress(items, [
      { orderItemId: 1, quantity: 40 },
    ]);
    const resolved = resolveShipmentFromLines(lines, [
      { orderItemId: 2, sentFully: true },
      { orderItemId: 3, sentFully: true },
    ]);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.isFullDelivery).toBe(true);
  });
});
