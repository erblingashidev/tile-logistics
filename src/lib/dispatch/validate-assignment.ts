import { isTransportVehicle } from "@/lib/services/vehicles";
import { getDb } from "@/lib/db";
import { dbOne } from "@/lib/db/query";
import { vehicles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getOrder } from "@/lib/services/orders";

/**
 * Assignment gate — transport trucks only.
 * Tile/crane preference is manual via order.preferredTruckId (smart dispatch honors it).
 */
export async function validateTruckForOrder(
  orderId: number,
  vehicleId: number,
  options?: {
    /** @deprecated No longer used — kept for API compatibility. */
    ignoreCraneRule?: boolean;
    preloadedOrder?: unknown;
    preloadedVehicle?: typeof vehicles.$inferSelect;
  }
): Promise<
  | { ok: true; warning?: string }
  | { ok: false; error: string; requiresCrane?: true }
> {
  const order = options?.preloadedOrder ?? (await getOrder(orderId));
  if (!order) return { ok: false, error: "Order not found" };

  const db = await getDb();
  const vehicle =
    options?.preloadedVehicle ??
    (await dbOne(
      db.select().from(vehicles).where(eq(vehicles.id, vehicleId))
    ));
  if (!vehicle) return { ok: false, error: "Vehicle not found" };

  if (!isTransportVehicle(vehicle)) {
    return {
      ok: false,
      error:
        "This vehicle is a sales / company car — use a delivery truck for orders.",
    };
  }

  return { ok: true };
}
