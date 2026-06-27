import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll, dbOne } from "@/lib/db/query";
import {
  inventoryLines,
  inventorySessions,
  warehouseLocations,
  products,
} from "@/lib/db/schema";
import { receiveStock } from "@/lib/services/stock";
import { upsertProduct } from "@/lib/services/products";

export async function listInventorySessions() {
  const db = await getDb();
  return dbAll(
    db
      .select()
      .from(inventorySessions)
      .orderBy(desc(inventorySessions.startedAt))
  );
}

export async function getOpenInventorySession() {
  const db = await getDb();
  return dbOne(
    db
      .select()
      .from(inventorySessions)
      .where(eq(inventorySessions.status, "open"))
      .orderBy(desc(inventorySessions.startedAt))
  );
}

export async function startInventorySession(input: {
  name: string;
  employeeId?: number;
  notes?: string;
}) {
  const open = await getOpenInventorySession();
  if (open) {
    return { ok: false as const, error: "Ka tashmë një inventar të hapur.", session: open };
  }

  const db = await getDb();
  const now = new Date().toISOString();
  const inserted = await dbOne(
    db
      .insert(inventorySessions)
      .values({
        name: input.name.trim(),
        status: "open",
        startedAt: now,
        startedByEmployeeId: input.employeeId ?? null,
        notes: input.notes?.trim() || null,
      })
      .returning({ id: inventorySessions.id })
  );

  return {
    ok: true as const,
    session: await dbOne(
      db
        .select()
        .from(inventorySessions)
        .where(eq(inventorySessions.id, inserted!.id))
    ),
  };
}

export async function addInventoryLine(input: {
  sessionId: number;
  ean: string;
  quantityM2: number;
  locationId?: number;
  employeeId?: number;
  notes?: string;
}) {
  const db = await getDb();
  const session = await dbOne(
    db
      .select()
      .from(inventorySessions)
      .where(eq(inventorySessions.id, input.sessionId))
  );
  if (!session || session.status !== "open") {
    return { ok: false as const, error: "Sesioni i inventarit nuk është aktiv." };
  }

  const product = await upsertProduct({
    ean: input.ean,
    source: "inventory",
  });

  const now = new Date().toISOString();
  const line = await dbOne(
    db
      .insert(inventoryLines)
      .values({
        sessionId: input.sessionId,
        productId: product?.id ?? null,
        ean: input.ean.trim(),
        quantityM2: input.quantityM2,
        locationId: input.locationId ?? null,
        employeeId: input.employeeId ?? null,
        notes: input.notes?.trim() || null,
        countedAt: now,
      })
      .returning({ id: inventoryLines.id })
  );

  return { ok: true as const, lineId: line!.id, product };
}

export async function listInventoryLines(sessionId: number) {
  const db = await getDb();
  return dbAll(
    db
      .select({
        id: inventoryLines.id,
        ean: inventoryLines.ean,
        quantityM2: inventoryLines.quantityM2,
        notes: inventoryLines.notes,
        countedAt: inventoryLines.countedAt,
        productName: products.productName,
        locationCode: warehouseLocations.code,
      })
      .from(inventoryLines)
      .leftJoin(products, eq(inventoryLines.productId, products.id))
      .leftJoin(
        warehouseLocations,
        eq(inventoryLines.locationId, warehouseLocations.id)
      )
      .where(eq(inventoryLines.sessionId, sessionId))
      .orderBy(desc(inventoryLines.countedAt))
  );
}

/** Apply counted lines to stock — use default location per line or fallback. */
export async function closeInventorySession(
  sessionId: number,
  defaultLocationId: number
) {
  const db = await getDb();
  const session = await dbOne(
    db
      .select()
      .from(inventorySessions)
      .where(eq(inventorySessions.id, sessionId))
  );
  if (!session || session.status !== "open") {
    return { ok: false as const, error: "Sesioni nuk është i hapur." };
  }

  const lines = await dbAll(
    db
      .select()
      .from(inventoryLines)
      .where(eq(inventoryLines.sessionId, sessionId))
  );

  let applied = 0;
  for (const line of lines) {
    if (!line.ean || line.quantityM2 <= 0) continue;
    const loc = line.locationId ?? defaultLocationId;
    const result = await receiveStock({
      ean: line.ean,
      quantityM2: line.quantityM2,
      locationId: loc,
      employeeId: line.employeeId ?? undefined,
      notes: `Inventory ${session.name}`,
    });
    if (result.ok) applied += 1;
  }

  const now = new Date().toISOString();
  await db
    .update(inventorySessions)
    .set({ status: "closed", closedAt: now })
    .where(eq(inventorySessions.id, sessionId));

  return { ok: true as const, applied, totalLines: lines.length };
}
