import { analyzeDispatchCargo } from "@/lib/services/dispatch-planning";
import { vehicleHasCrane, isDafTruck, isExcludedSmallVan, DAF_MIN_PALLETS } from "@/lib/dispatch/vehicles";
import { getDb } from "@/lib/db";
import { dbOne } from "@/lib/db/query";
import { vehicles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getOrder } from "@/lib/services/orders";

type OrderCargoInput = {
  customerHasForklift?: boolean;
  totalPieces?: number | null;
  totalPallets?: number | null;
  items?: Array<{
    productType?: string | null;
    tileWidthCm?: number | null;
    tileHeightCm?: number | null;
    quantity?: number | null;
    calculatedPieces?: number | null;
  }>;
};

export async function validateTruckForOrder(
  orderId: number,
  vehicleId: number,
  options?: {
    ignoreCraneRule?: boolean;
    preloadedOrder?: OrderCargoInput;
    preloadedVehicle?: typeof vehicles.$inferSelect;
  }
): Promise<
  | { ok: true; warning?: string }
  | { ok: false; error: string; requiresCrane?: true }
> {
  const order =
    options?.preloadedOrder ?? (await getOrder(orderId));
  if (!order) return { ok: false, error: "Order not found" };

  const db = await getDb();
  const vehicle =
    options?.preloadedVehicle ??
    (await dbOne(
      db.select().from(vehicles).where(eq(vehicles.id, vehicleId))
    ));
  if (!vehicle) return { ok: false, error: "Vehicle not found" };

  const cargo = analyzeDispatchCargo(order.items ?? [], {
    customerHasForklift: Boolean(order.customerHasForklift),
    totalPieces: order.totalPieces ?? undefined,
  });
  const isCrane = vehicleHasCrane(vehicle);

  if ((cargo.requiresCrane || cargo.preferCrane) && !isCrane && !options?.ignoreCraneRule) {
    return {
      ok: false,
      error:
        "Large/jumbo tiles require the crane truck. Proceed without crane?",
      requiresCrane: true,
    };
  }

  if (!cargo.requiresCrane && !cargo.preferCrane && !cargo.hasLargeTiles && isCrane) {
    return {
      ok: true,
      warning:
        "Crane / Krani truck is for jumbo tiles only — use Sprinter or Iveco for standard sizes like 60×120.",
    };
  }

  if (cargo.hasLargeTiles && isExcludedSmallVan(vehicle) && !cargo.preferAtego) {
    return {
      ok: false,
      error:
        "Large tiles cannot go on Iveco/Sprinter without crane — use Volvo, Atego, or DAF.",
    };
  }

  const orderPallets = order.totalPallets ?? 0;
  if (isDafTruck(vehicle) && orderPallets < DAF_MIN_PALLETS) {
    return {
      ok: true,
      warning: `DAF is for large loads (${DAF_MIN_PALLETS}+ pallets). This order has ${orderPallets} — consider Sprinter or Iveco.`,
    };
  }

  return { ok: true };
}
