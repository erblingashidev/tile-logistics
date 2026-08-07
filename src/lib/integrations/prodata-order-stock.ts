/**
 * Issue stock when a logistics order is created (local WMS only).
 * Putaway stays internal — Pro-Data API has no bin-level move endpoints.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll } from "@/lib/db/query";
import {
  orderItems,
  orders,
  products,
  stockBalances,
  stockMovements,
} from "@/lib/db/schema";
import { isInvoiceAdjustmentLine } from "@/lib/order-lines/classification";
import { formatM2 } from "@/lib/calculations";
import { logActivity } from "@/lib/logger";
import {
  getOrCreateBalance,
  getOrCreateWarehouseLocation,
} from "@/lib/services/stock";

const MAIN_WAREHOUSE_CODE = "PRODATA-MAIN";

export interface OrderStockIssueResult {
  ok: boolean;
  issuedLines: number;
  skippedLines: number;
  shortfalls: string[];
}

async function resolveMainWarehouseLocationId(): Promise<number | null> {
  const loc = await getOrCreateWarehouseLocation({
    code: MAIN_WAREHOUSE_CODE,
    zone: "Pro-Data",
    label: "Depoja Kryesore Shkabaj",
    notes: "Pro-Data main warehouse — default pick location for order issue",
  });
  return loc?.id ?? null;
}

/** Decrement PRODATA-MAIN stock for each order line with a known EAN. */
export async function issueStockForOrder(
  orderId: number
): Promise<OrderStockIssueResult> {
  const db = await getDb();
  const locationId = await resolveMainWarehouseLocationId();
  if (!locationId) {
    return {
      ok: false,
      issuedLines: 0,
      skippedLines: 0,
      shortfalls: ["Main Pro-Data warehouse location not found."],
    };
  }

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
    return {
      ok: false,
      issuedLines: 0,
      skippedLines: 0,
      shortfalls: ["Order not found."],
    };
  }

  const lines = await dbAll(
    db
      .select({
        ean: orderItems.productEan,
        quantityM2: orderItems.quantityM2,
        lineKind: orderItems.lineKind,
        productName: orderItems.productName,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
  );

  const now = new Date().toISOString();
  let issuedLines = 0;
  let skippedLines = 0;
  const shortfalls: string[] = [];

  for (const line of lines) {
    if (isInvoiceAdjustmentLine(line)) {
      skippedLines += 1;
      continue;
    }
    const ean = line.ean?.trim();
    const qty = line.quantityM2 ?? 0;
    if (!ean || qty <= 0) {
      skippedLines += 1;
      continue;
    }

    const [product] = await dbAll(
      db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.ean, ean))
        .limit(1)
    );
    if (!product) {
      skippedLines += 1;
      shortfalls.push(`${ean}: product not in catalog`);
      continue;
    }

    const balance = await getOrCreateBalance(product.id, locationId);
    const available = balance?.quantityM2 ?? 0;
    if (available + 0.0001 < qty) {
      shortfalls.push(
        `${ean}: need ${formatM2(qty)} m², only ${formatM2(available)} at ${MAIN_WAREHOUSE_CODE}`
      );
    }

    const issueQty = Math.min(qty, Math.max(0, available));
    if (issueQty <= 0) {
      skippedLines += 1;
      continue;
    }

    await db
      .update(stockBalances)
      .set({
        quantityM2: Math.max(0, available - issueQty),
        updatedAt: now,
      })
      .where(eq(stockBalances.id, balance!.id));

    await db.insert(stockMovements).values({
      productId: product.id,
      locationId,
      movementType: "issue",
      quantityM2: issueQty,
      fullPallets: 0,
      loosePieces: 0,
      referenceType: "order",
      referenceId: orderId,
      notes: `Order ${order.invoiceNumber ?? orderId}`,
      createdAt: now,
    });

    issuedLines += 1;
  }

  if (issuedLines > 0 || shortfalls.length > 0) {
    await logActivity(
      "update",
      "stock",
      orderId,
      `Order stock issue: ${issuedLines} line(s) from ${MAIN_WAREHOUSE_CODE}`,
      {
        category: "orders",
        details: { issuedLines, skippedLines, shortfalls },
      }
    );
  }

  return {
    ok: shortfalls.length === 0,
    issuedLines,
    skippedLines,
    shortfalls,
  };
}
