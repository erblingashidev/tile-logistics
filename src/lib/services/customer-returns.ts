import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll, dbOne } from "@/lib/db/query";
import {
  customerReturnLines,
  customerReturns,
  orderItems,
} from "@/lib/db/schema";
import {
  isReturnCondition,
  type ReturnCondition,
} from "@/lib/customer-return-conditions";
import { type OrderUnit } from "@/lib/constants";
import { isLogisticsLine } from "@/lib/order-lines/classification";
import { logActivity } from "@/lib/logger";
import { getOrderByInvoiceNumber } from "@/lib/services/orders";
import {
  lineNativeOrdered,
  type LineShipmentProgress,
  type OrderItemLike,
} from "@/lib/shipment-line-progress";

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
        lines: resolvedLines.map((line) => ({
          productName: line.productName,
          quantity: line.quantity,
          unit: line.unit,
          condition: line.condition,
          notes: line.notes,
        })),
      },
    }
  );

  return {
    ok: true as const,
    returnId: inserted.id,
    invoiceNumber: lookup.invoiceNumber,
    lineCount: resolvedLines.length,
  };
}

export type CustomerReturnSummary = {
  id: number;
  orderId: number;
  invoiceNumber: string;
  status: string;
  notes: string | null;
  createdAt: string;
  postedAt: string | null;
  lines: Array<{
    id: number;
    productName: string;
    quantity: number;
    unit: string;
    condition: string;
    notes: string | null;
  }>;
};

export async function listCustomerReturns(limit = 50): Promise<CustomerReturnSummary[]> {
  const db = await getDb();
  const headers = await dbAll(
    db
      .select()
      .from(customerReturns)
      .orderBy(desc(customerReturns.createdAt))
      .limit(limit)
  );
  if (!headers.length) return [];

  const returnIds = headers.map((h) => h.id);
  const allLines = returnIds.length
    ? await dbAll(
        db
          .select({
            id: customerReturnLines.id,
            returnId: customerReturnLines.returnId,
            quantity: customerReturnLines.quantity,
            unit: customerReturnLines.unit,
            condition: customerReturnLines.condition,
            notes: customerReturnLines.notes,
            productName: orderItems.productName,
            productEan: orderItems.productEan,
          })
          .from(customerReturnLines)
          .innerJoin(
            orderItems,
            eq(customerReturnLines.orderItemId, orderItems.id)
          )
          .where(inArray(customerReturnLines.returnId, returnIds))
      )
    : [];

  const linesByReturn = new Map<number, CustomerReturnSummary["lines"]>();
  for (const row of allLines) {
    if (!returnIds.includes(row.returnId)) continue;
    const list = linesByReturn.get(row.returnId) ?? [];
    list.push({
      id: row.id,
      productName:
        row.productName?.trim() || row.productEan?.trim() || "Product",
      quantity: row.quantity,
      unit: row.unit,
      condition: row.condition,
      notes: row.notes,
    });
    linesByReturn.set(row.returnId, list);
  }

  return headers.map((h) => ({
    id: h.id,
    orderId: h.orderId,
    invoiceNumber: h.invoiceNumber,
    status: h.status,
    notes: h.notes,
    createdAt: h.createdAt,
    postedAt: h.postedAt,
    lines: linesByReturn.get(h.id) ?? [],
  }));
}
