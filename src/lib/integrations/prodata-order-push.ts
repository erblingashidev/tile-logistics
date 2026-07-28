/**
 * Push logistics orders to Pro-Data via B2BPostBulkOrder.
 * When Pro-Data accepts the order, their ERP decrements stock on their side.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll } from "@/lib/db/query";
import { orderItems, orders } from "@/lib/db/schema";
import { logActivity } from "@/lib/logger";
import {
  postProDataBulkOrder,
  type ProDataBulkOrderItem,
} from "@/lib/integrations/prodata-api";

export interface ProDataOrderPushResult {
  ok: boolean;
  message: string;
  orderRef?: string | null;
}

export async function pushOrderToProData(
  orderId: number
): Promise<ProDataOrderPushResult> {
  const db = await getDb();
  const [order] = await dbAll(
    db
      .select({
        id: orders.id,
        invoiceNumber: orders.invoiceNumber,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1)
  );
  if (!order) {
    return { ok: false, message: "Order not found." };
  }

  const lines = await dbAll(
    db
      .select({
        ean: orderItems.ean,
        quantityM2: orderItems.quantityM2,
        price: orderItems.price,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
  );

  const items: ProDataBulkOrderItem[] = [];
  for (const line of lines) {
    const code = line.ean?.trim();
    const qty = line.quantityM2 ?? 0;
    if (!code || qty <= 0) continue;
    const price = line.price ?? 0;
    items.push({
      ItemCode: code,
      Quantity: qty,
      Price: price,
      Discount: 0,
      PriceAfterDiscount: price,
      VariantCode1: "",
      VariantCode2: "",
    });
  }

  if (items.length === 0) {
    return { ok: false, message: "No order lines with EAN and quantity to push." };
  }

  const result = await postProDataBulkOrder(items);
  if (result.hasError) {
    return {
      ok: false,
      message: result.errorMsg || "Pro-Data rejected the order.",
    };
  }

  await logActivity(
    "create",
    "prodata_order",
    orderId,
    `Pushed order ${order.invoiceNumber ?? orderId} to Pro-Data`,
    {
      category: "integrations",
      details: {
        returnData: result.returnData,
        returnText: result.returnText,
        lineCount: items.length,
      },
    }
  );

  return {
    ok: true,
    message: result.returnText || "Order sent to Pro-Data.",
    orderRef: result.returnData,
  };
}
