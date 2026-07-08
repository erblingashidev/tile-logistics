import { analyzeOrderCargo } from "@/lib/dispatch/large-tiles";
import { vehicleHasCrane, isDafTruck, DAF_MIN_PALLETS } from "@/lib/dispatch/vehicles";
import { getDb } from "@/lib/db";
import { dbOne } from "@/lib/db/query";
import { vehicles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getOrder } from "@/lib/services/orders";

export async function validateTruckForOrder(
  orderId: number,
  vehicleId: number,
  options?: { ignoreCraneRule?: boolean }
): Promise<
  | { ok: true; warning?: string }
  | { ok: false; error: string; requiresCrane?: true }
> {
  const order = await getOrder(orderId);
  if (!order) return { ok: false, error: "Order not found" };

  const db = await getDb();
  const vehicle = await dbOne(
    db.select().from(vehicles).where(eq(vehicles.id, vehicleId))
  );
  if (!vehicle) return { ok: false, error: "Vehicle not found" };

  const cargo = analyzeOrderCargo(order.items ?? []);
  const isCrane = vehicleHasCrane(vehicle);

  if (cargo.requiresCrane && !isCrane && !options?.ignoreCraneRule) {
    return {
      ok: false,
      error:
        "Jumbo tiles require the crane truck. Proceed without crane?",
      requiresCrane: true,
    };
  }

  if (!cargo.requiresCrane && isCrane) {
    return {
      ok: true,
      warning:
        "Crane / Krani truck is for jumbo tiles only — use Sprinter or Iveco for standard sizes like 60×120.",
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
