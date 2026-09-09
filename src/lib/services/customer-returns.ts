import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll, dbOne } from "@/lib/db/query";
import {
  customerReturnLines,
  customerReturns,
  orderItems,
} from "@/lib/db/schema";
import {
  isReturnCondition,
  returnLocationCode,
  type ReturnCondition,
} from "@/lib/customer-return-conditions";
import { normalizeOrderUnit, type OrderUnit } from "@/lib/constants";
import { isLogisticsLine } from "@/lib/order-lines/classification";
import { logActivity } from "@/lib/logger";
import { getOrderByInvoiceNumber } from "@/lib/services/orders";
import {
  computeLineShipmentProgress,
  lineNativeOrdered,
  type LineShipmentProgress,
  type OrderItemLike,
} from "@/lib/shipment-line-progress";
import { ensureReturnLocation, receiveStock } from "@/lib/services/stock";

export type ReturnableLine = LineShipmentProgress & {
  returnable: number;
  alreadyReturned: number;
  productEan: string | null;
};

export type ReturnLineInput = {
  orderItemId: number;
  quantity: number;
  condition: ReturnCondition;
  notes?: string;
};

function roundQty(unit: OrderUnit, n: number): number {
  if (unit === "piece") return Math.round(n);
  if (unit === "m2") return Math.round(n * 100) / 100;
  return Math.round(n * 10) / 10;
}

async function priorReturnsByItem(orderId: number) {
  const db = await getDb();
  const rows = await dbAll(
    db
      .select({
        orderItemId: customerReturnLines.orderItemId,
        quantity: customerReturnLines.quantity,
      })
      .from(customerReturnLines)
      .innerJoin(
        customerReturns,
        eq(customerReturnLines.returnId, customerReturns.id)
      )
      .where(eq(customerReturns.orderId, orderId))
  );
  const map = new Map<number, number>();
  for (const row of rows) {
    map.set(
      row.orderItemId,
      (map.get(row.orderItemId) ?? 0) + (Number(row.quantity) || 0)
    );
  }
  return map;
}

export function computeReturnableLines(
  items: OrderItemLike[],
  shipmentLines: LineShipmentProgress[],
  priorReturned: Map<number, number>
): ReturnableLine[] {
  const shipmentByItem = new Map(
    shipmentLines.map((line) => [line.orderItemId, line])
  );

  return items
    .filter((item) => isLogisticsLine(item) && item.id > 0)
    .map((item) => {
      const native = lineNativeOrdered(item);
      const shipment = shipmentByItem.get(item.id);
      const ordered = native.qty;
      const delivered = shipment?.sent ?? 0;
      const maxReturnable = delivered > 0 ? delivered : ordered;
      const alreadyReturned = roundQty(
        native.unit,
        priorReturned.get(item.id) ?? 0
      );
      const returnable = Math.max(
        0,
        roundQty(native.unit, maxReturnable - alreadyReturned)
      );

      return {
        orderItemId: item.id,
        productName: item.productName?.trim() || item.productEan || "Product",
        productEan: item.productEan ?? null,
        unit: native.unit,
        unitLabel: shipment?.unitLabel ?? native.unitLabel,
        ordered,
        sent: delivered,
        remaining: returnable,
        orderedPallets: shipment?.orderedPallets ?? 0,
        orderedPieces: shipment?.orderedPieces ?? 0,
        orderedM2: shipment?.orderedM2 ?? 0,
        returnable,
        alreadyReturned,
      };
    })
    .filter((line) => line.returnable > 0 || line.alreadyReturned > 0);
}

export async function lookupOrderForReturn(invoiceNumber: string) {
  const order = await getOrderByInvoiceNumber(invoiceNumber);
  if (!order) return null;

  const priorReturned = await priorReturnsByItem(order.id);
  const shipmentLines = order.shipmentLines ?? [];
  const returnableLines = computeReturnableLines(
    order.items,
    shipmentLines,
    priorReturned
  );

  return {
    orderId: order.id,
    invoiceNumber: order.invoiceNumber,
    customerName: order.customerName,
    orderDate: order.orderDate,
    status: order.status,
    lines: returnableLines,
    hasOpenReturnable: returnableLines.some((l) => l.returnable > 0),
  };
}

function stockReceiveArgs(quantity: number, unit: OrderUnit) {
  if (unit === "m2") {
    return { quantityM2: quantity, skipStock: false as const };
  }
  if (unit === "piece") {
    return { loosePieces: Math.round(quantity), skipStock: false as const };
  }
  if (unit === "kg") {
    return { skipStock: true as const, reason: "kg returns are recorded only" };
  }
  return { quantityM2: quantity, skipStock: false as const };
}

export async function createCustomerReturn(input: {
  invoiceNumber: string;
  lines: ReturnLineInput[];
  notes?: string;
  employeeId?: number;
}) {
  const lookup = await lookupOrderForReturn(input.invoiceNumber);
  if (!lookup) {
    return { ok: false as const, error: "Invoice not found." };
  }
  if (!lookup.hasOpenReturnable) {
    return {
      ok: false as const,
      error: "Nothing left to return on this invoice.",
    };
  }
  if (!input.lines.length) {
    return {
      ok: false as const,
      error: "Select at least one product and enter how much was returned.",
    };
  }

  const byItem = new Map(lookup.lines.map((l) => [l.orderItemId, l]));
  const db = await getDb();
  const now = new Date().toISOString();

  const resolvedLines: Array<{
    orderItemId: number;
    quantity: number;
    unit: OrderUnit;
    condition: ReturnCondition;
    quantityM2: number;
    loosePieces: number;
    notes: string | null;
    productEan: string | null;
    productName: string;
  }> = [];

  for (const line of input.lines) {
    if (!isReturnCondition(line.condition)) {
      return { ok: false as const, error: "Invalid return condition." };
    }
    const item = byItem.get(line.orderItemId);
    if (!item) {
      return { ok: false as const, error: "Unknown product line on this invoice." };
    }
    const qty = roundQty(item.unit, Number(line.quantity));
    if (!Number.isFinite(qty) || qty <= 0) {
      return {
        ok: false as const,
        error: `Enter how much of “${item.productName}” was returned (${item.unitLabel}).`,
      };
    }
    if (qty > item.returnable + 0.001) {
      return {
        ok: false as const,
        error: `Only ${item.returnable} ${item.unitLabel} can still be returned for “${item.productName}”.`,
      };
    }

    resolvedLines.push({
      orderItemId: line.orderItemId,
      quantity: qty,
      unit: item.unit,
      condition: line.condition,
      quantityM2: item.unit === "m2" ? qty : 0,
      loosePieces: item.unit === "piece" ? Math.round(qty) : 0,
      notes: line.notes?.trim() || null,
      productEan: item.productEan,
      productName: item.productName,
    });
  }

  const inserted = await dbOne(
    db
      .insert(customerReturns)
      .values({
        orderId: lookup.orderId,
        invoiceNumber: lookup.invoiceNumber,
        status: "posted",
        notes: input.notes?.trim() || null,
        employeeId: input.employeeId ?? null,
        createdAt: now,
        postedAt: now,
      })
      .returning({ id: customerReturns.id })
  );
  if (!inserted?.id) {
    return { ok: false as const, error: "Could not save return." };
  }

  await db.insert(customerReturnLines).values(
    resolvedLines.map((line) => ({
      returnId: inserted.id,
      orderItemId: line.orderItemId,
      quantity: line.quantity,
      unit: line.unit,
      condition: line.condition,
      quantityM2: line.quantityM2,
      loosePieces: line.loosePieces,
      notes: line.notes,
    }))
  );

  const stockResults: Array<{ productName: string; ok: boolean; error?: string }> =
    [];

  for (const line of resolvedLines) {
    const ean = line.productEan?.trim();
    if (!ean || ean.length < 4) {
      stockResults.push({
        productName: line.productName,
        ok: false,
        error: "No barcode on invoice line — return recorded, stock not updated.",
      });
      continue;
    }

    const locCode = returnLocationCode(line.condition);
    const location = await ensureReturnLocation({
      code: locCode,
      label:
        line.condition === "untouched"
          ? "Returns — sellable"
          : "Returns — damaged",
      notes: `Customer returns (${line.condition})`,
    });
    if (!location) {
      stockResults.push({
        productName: line.productName,
        ok: false,
        error: "Could not create return location.",
      });
      continue;
    }

    const orderItem = await dbOne(
      db
        .select()
        .from(orderItems)
        .where(eq(orderItems.id, line.orderItemId))
    );

    const receiveArgs = stockReceiveArgs(line.quantity, line.unit);
    if (receiveArgs.skipStock) {
      stockResults.push({
        productName: line.productName,
        ok: true,
        error: receiveArgs.reason,
      });
      continue;
    }

    const stock = await receiveStock({
      ean,
      productName: line.productName,
      locationId: location.id,
      tileWidthCm: orderItem?.tileWidthCm ?? undefined,
      tileHeightCm: orderItem?.tileHeightCm ?? undefined,
      tileThicknessCm: orderItem?.tileThicknessCm ?? undefined,
      movementType: "return",
      referenceType: "customer_return",
      referenceId: inserted.id,
      employeeId: input.employeeId,
      notes: `Return ${line.condition} · ${lookup.invoiceNumber}${line.notes ? ` · ${line.notes}` : ""}`,
      ...receiveArgs,
    });

    stockResults.push({
      productName: line.productName,
      ok: stock.ok,
      error: stock.ok ? undefined : stock.error,
    });
  }

  await logActivity(
    "create",
    "customer_return",
    inserted.id,
    `Customer return ${lookup.invoiceNumber} — ${resolvedLines.length} line(s)`,
    {
      category: "system",
      details: {
        orderId: lookup.orderId,
        invoiceNumber: lookup.invoiceNumber,
        lineCount: resolvedLines.length,
        stockResults,
      },
    }
  );

  return {
    ok: true as const,
    returnId: inserted.id,
    invoiceNumber: lookup.invoiceNumber,
    lineCount: resolvedLines.length,
    stockResults,
  };
}

export async function listCustomerReturns(limit = 50) {
  const db = await getDb();
  return dbAll(
    db
      .select()
      .from(customerReturns)
      .orderBy(desc(customerReturns.createdAt))
      .limit(limit)
  );
}
