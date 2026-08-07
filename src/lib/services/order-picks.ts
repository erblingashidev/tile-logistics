import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll } from "@/lib/db/query";
import { orderItems, orderPickLines, orders } from "@/lib/db/schema";
import { getProductByEan } from "@/lib/services/products";
import {
  listStockLocationsForProduct,
  pickStockFromLocation,
} from "@/lib/services/stock";
import { submitDeliveryProof } from "@/lib/services/delivery-proofs";
import type { EmployeeRole } from "@/lib/constants";
import { isInvoiceAdjustmentLine } from "@/lib/order-lines/classification";

export interface OrderPickLineInput {
  orderItemId?: number | null;
  productId: number;
  locationId: number;
  quantityM2: number;
}

export interface OrderPrepareLine {
  orderItemId: number;
  productId: number | null;
  productEan: string | null;
  productName: string | null;
  orderedM2: number;
  stockLocations: Awaited<ReturnType<typeof listStockLocationsForProduct>>;
}

export async function getOrderPrepareLines(
  orderId: number
): Promise<OrderPrepareLine[]> {
  const db = await getDb();
  const items = await dbAll(
    db
      .select({
        id: orderItems.id,
        productEan: orderItems.productEan,
        productName: orderItems.productName,
        quantityM2: orderItems.quantityM2,
        lineKind: orderItems.lineKind,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
  );

  const lines: OrderPrepareLine[] = [];
  for (const item of items) {
    if (isInvoiceAdjustmentLine(item)) continue;
    let productId: number | null = null;
    const ean = item.productEan?.trim();
    if (ean) {
      const product = await getProductByEan(ean);
      productId = product?.id ?? null;
    }
    const stockLocations = productId
      ? await listStockLocationsForProduct(productId)
      : [];
    lines.push({
      orderItemId: item.id,
      productId,
      productEan: item.productEan,
      productName: item.productName,
      orderedM2: item.quantityM2 ?? 0,
      stockLocations,
    });
  }
  return lines;
}

export async function prepareOrderWithPicks(input: {
  orderId: number;
  employeeId: number;
  employeeRoles: EmployeeRole[];
  picks: OrderPickLineInput[];
  notes?: string;
}) {
  const db = await getDb();
  const [order] = await dbAll(
    db
      .select({ id: orders.id, invoiceNumber: orders.invoiceNumber })
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .limit(1)
  );
  if (!order) {
    return { ok: false as const, error: "Order not found." };
  }

  if (!input.picks.length) {
    return { ok: false as const, error: "Add at least one pick line." };
  }

  const now = new Date().toISOString();
  for (const pick of input.picks) {
    const result = await pickStockFromLocation({
      productId: pick.productId,
      locationId: pick.locationId,
      quantityM2: pick.quantityM2,
      orderId: input.orderId,
      orderItemId: pick.orderItemId,
      employeeId: input.employeeId,
      notes: `Prepared ${order.invoiceNumber ?? input.orderId}`,
    });
    if (!result.ok) {
      return result;
    }

    await db.insert(orderPickLines).values({
      orderId: input.orderId,
      orderItemId: pick.orderItemId ?? null,
      productId: pick.productId,
      locationId: pick.locationId,
      quantityM2: pick.quantityM2,
      employeeId: input.employeeId,
      createdAt: now,
    });
  }

  const proof = await submitDeliveryProof({
    orderId: input.orderId,
    employeeId: input.employeeId,
    employeeRoles: input.employeeRoles,
    phase: "prepared",
    notes: input.notes,
  });

  if (!proof.ok) {
    return proof;
  }

  return { ok: true as const, proof };
}
