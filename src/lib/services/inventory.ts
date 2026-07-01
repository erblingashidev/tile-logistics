import { eq, desc, and, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbAll, dbOne } from "@/lib/db/query";
import {
  inventoryLines,
  inventorySectorCounts,
  inventorySessions,
  inventorySnapshots,
  inventoryVarianceLines,
  inventoryVarianceReports,
  stockBalances,
  warehouseLocations,
  products,
} from "@/lib/db/schema";
import { adjustStockToCount } from "@/lib/services/stock";
import { upsertProduct } from "@/lib/services/products";
import { listDistinctWarehouseZones } from "@/lib/services/warehouse-zones";

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

export async function getInventorySession(sessionId: number) {
  const db = await getDb();
  return dbOne(
    db
      .select()
      .from(inventorySessions)
      .where(eq(inventorySessions.id, sessionId))
  );
}

function sessionAllowsAdminLineEdits(status: string) {
  return status === "open" || status === "closed" || status === "cancelled";
}

async function snapshotBookStock(sessionId: number) {
  const db = await getDb();
  const existing = await dbOne(
    db
      .select({ id: inventorySnapshots.id })
      .from(inventorySnapshots)
      .where(eq(inventorySnapshots.sessionId, sessionId))
      .limit(1)
  );
  if (existing) return;

  const rows = await dbAll(
    db
      .select({
        productId: stockBalances.productId,
        locationId: stockBalances.locationId,
        quantityM2: stockBalances.quantityM2,
        zone: warehouseLocations.zone,
      })
      .from(stockBalances)
      .innerJoin(
        warehouseLocations,
        eq(stockBalances.locationId, warehouseLocations.id)
      )
  );

  const now = new Date().toISOString();
  for (const row of rows) {
    await db.insert(inventorySnapshots).values({
      sessionId,
      productId: row.productId,
      locationId: row.locationId,
      zone: row.zone?.trim() || null,
      quantityM2: row.quantityM2 ?? 0,
      createdAt: now,
    });
  }
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

  await snapshotBookStock(inserted!.id);

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

export async function listSectorCounts(sessionId: number) {
  const db = await getDb();
  const sectors = await dbAll(
    db
      .select()
      .from(inventorySectorCounts)
      .where(eq(inventorySectorCounts.sessionId, sessionId))
      .orderBy(desc(inventorySectorCounts.startedAt))
  );

  const lineCounts = await dbAll(
    db
      .select({
        sectorCountId: inventoryLines.sectorCountId,
        lineCount: sql<number>`count(*)`.as("lineCount"),
        totalM2: sql<number>`coalesce(sum(${inventoryLines.quantityM2}), 0)`.as(
          "totalM2"
        ),
      })
      .from(inventoryLines)
      .where(eq(inventoryLines.sessionId, sessionId))
      .groupBy(inventoryLines.sectorCountId)
  );

  const stats = new Map(
    lineCounts.map((row) => [
      row.sectorCountId,
      { lineCount: row.lineCount, totalM2: row.totalM2 },
    ])
  );

  return sectors.map((sector) => ({
    ...sector,
    lineCount: stats.get(sector.id)?.lineCount ?? 0,
    totalM2: stats.get(sector.id)?.totalM2 ?? 0,
  }));
}

export async function listInventoryZonesWithStatus(sessionId: number) {
  const zones = await listDistinctWarehouseZones();
  const sectors = await listSectorCounts(sessionId);
  const byZone = new Map<string, (typeof sectors)[number]>();

  for (const sector of sectors) {
    const existing = byZone.get(sector.zone);
    if (!existing || sector.status === "counting") {
      byZone.set(sector.zone, sector);
    }
  }

  return zones.map((zone) => {
    const sector = byZone.get(zone);
    return {
      zone,
      status: sector?.status ?? "pending",
      sectorCountId: sector?.id ?? null,
      lineCount: sector?.lineCount ?? 0,
      totalM2: sector?.totalM2 ?? 0,
    };
  });
}

export async function startSectorCount(input: {
  sessionId: number;
  zone: string;
  employeeId?: number;
}) {
  const zone = input.zone.trim();
  if (!zone) {
    return { ok: false as const, error: "Zgjidh zonën e depo." };
  }

  const session = await getOpenInventorySession();
  if (!session || session.id !== input.sessionId) {
    return { ok: false as const, error: "Sesioni i inventarit nuk është aktiv." };
  }

  const db = await getDb();
  const openSector = await dbOne(
    db
      .select()
      .from(inventorySectorCounts)
      .where(
        and(
          eq(inventorySectorCounts.sessionId, input.sessionId),
          eq(inventorySectorCounts.zone, zone),
          eq(inventorySectorCounts.status, "counting")
        )
      )
  );
  if (openSector) {
    return { ok: true as const, sector: openSector, resumed: true as const };
  }

  const now = new Date().toISOString();
  const inserted = await dbOne(
    db
      .insert(inventorySectorCounts)
      .values({
        sessionId: input.sessionId,
        zone,
        status: "counting",
        startedAt: now,
        startedByEmployeeId: input.employeeId ?? null,
      })
      .returning({ id: inventorySectorCounts.id })
  );

  const sector = await dbOne(
    db
      .select()
      .from(inventorySectorCounts)
      .where(eq(inventorySectorCounts.id, inserted!.id))
  );

  return { ok: true as const, sector: sector!, resumed: false as const };
}

export async function closeSectorCount(input: {
  sectorCountId: number;
  employeeId?: number;
}) {
  const db = await getDb();
  const sector = await dbOne(
    db
      .select()
      .from(inventorySectorCounts)
      .where(eq(inventorySectorCounts.id, input.sectorCountId))
  );
  if (!sector || sector.status !== "counting") {
    return { ok: false as const, error: "Sektori nuk është aktiv për numërim." };
  }

  const session = await dbOne(
    db
      .select()
      .from(inventorySessions)
      .where(eq(inventorySessions.id, sector.sessionId))
  );
  if (!session || session.status !== "open") {
    return { ok: false as const, error: "Sesioni i inventarit nuk është aktiv." };
  }

  const now = new Date().toISOString();
  await db
    .update(inventorySectorCounts)
    .set({
      status: "closed",
      closedAt: now,
      closedByEmployeeId: input.employeeId ?? null,
    })
    .where(eq(inventorySectorCounts.id, input.sectorCountId));

  return {
    ok: true as const,
    sector: await dbOne(
      db
        .select()
        .from(inventorySectorCounts)
        .where(eq(inventorySectorCounts.id, input.sectorCountId))
    ),
  };
}

async function validateLocationInZone(locationId: number, zone: string) {
  const db = await getDb();
  const loc = await dbOne(
    db
      .select()
      .from(warehouseLocations)
      .where(eq(warehouseLocations.id, locationId))
  );
  if (!loc) return { ok: false as const, error: "Vendndodhja nuk u gjet." };
  if ((loc.zone?.trim() || "") !== zone.trim()) {
    return {
      ok: false as const,
      error: "Vendndodhja nuk i përket kësaj zone.",
    };
  }
  return { ok: true as const, location: loc };
}

export async function addInventoryLine(input: {
  sessionId: number;
  ean: string;
  quantityM2: number;
  locationId: number;
  zone: string;
  sectorCountId: number;
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

  const zone = input.zone.trim();
  if (!zone) {
    return { ok: false as const, error: "Zgjidh zonën e depo." };
  }
  if (!input.locationId) {
    return { ok: false as const, error: "Zgjidh vendndodhjen në depo." };
  }

  const sector = await dbOne(
    db
      .select()
      .from(inventorySectorCounts)
      .where(eq(inventorySectorCounts.id, input.sectorCountId))
  );
  if (
    !sector ||
    sector.status !== "counting" ||
    sector.sessionId !== input.sessionId ||
    sector.zone !== zone
  ) {
    return {
      ok: false as const,
      error: "Sektori nuk është hapur — fillo numërimin e zones.",
    };
  }

  const locCheck = await validateLocationInZone(input.locationId, zone);
  if (!locCheck.ok) return locCheck;

  if (input.quantityM2 <= 0) {
    return { ok: false as const, error: "Sasia në m² duhet të jetë më e madhe se 0." };
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
        locationId: input.locationId,
        zone,
        sectorCountId: input.sectorCountId,
        employeeId: input.employeeId ?? null,
        notes: input.notes?.trim() || null,
        countedAt: now,
      })
      .returning({ id: inventoryLines.id })
  );

  return { ok: true as const, lineId: line!.id, product };
}

export async function updateInventorySession(input: {
  sessionId: number;
  name?: string;
  notes?: string;
}) {
  const db = await getDb();
  const session = await dbOne(
    db
      .select()
      .from(inventorySessions)
      .where(eq(inventorySessions.id, input.sessionId))
  );
  if (!session) {
    return { ok: false as const, error: "Sesioni i inventarit nuk u gjet." };
  }

  const name = input.name?.trim();
  if (name !== undefined && !name) {
    return { ok: false as const, error: "Emri i sesionit nuk mund të jetë bosh." };
  }

  await db
    .update(inventorySessions)
    .set({
      ...(name !== undefined ? { name } : {}),
      ...(input.notes !== undefined
        ? { notes: input.notes.trim() || null }
        : {}),
    })
    .where(eq(inventorySessions.id, input.sessionId));

  return {
    ok: true as const,
    session: await dbOne(
      db
        .select()
        .from(inventorySessions)
        .where(eq(inventorySessions.id, input.sessionId))
    ),
  };
}

/** Permanently remove a closed or cancelled session and all related records. */
export async function deleteInventorySession(sessionId: number) {
  const db = await getDb();
  const session = await getInventorySession(sessionId);
  if (!session) {
    return { ok: false as const, error: "Sesioni i inventarit nuk u gjet." };
  }
  if (session.status === "open") {
    return {
      ok: false as const,
      error: "Sesioni i hapur anulohet — nuk fshihet direkt.",
    };
  }

  const reports = await dbAll(
    db
      .select({ id: inventoryVarianceReports.id })
      .from(inventoryVarianceReports)
      .where(eq(inventoryVarianceReports.sessionId, sessionId))
  );

  for (const report of reports) {
    await db
      .update(inventoryVarianceReports)
      .set({ previousReportId: null })
      .where(eq(inventoryVarianceReports.previousReportId, report.id));
  }

  await db
    .delete(inventorySessions)
    .where(eq(inventorySessions.id, sessionId));

  return {
    ok: true as const,
    wasFinalized: session.status === "closed",
  };
}

/** Abort an open inventory session without applying stock changes. */
export async function cancelInventorySession(sessionId: number) {
  const db = await getDb();
  const session = await dbOne(
    db
      .select()
      .from(inventorySessions)
      .where(eq(inventorySessions.id, sessionId))
  );
  if (!session || session.status !== "open") {
    return { ok: false as const, error: "Sesioni i inventarit nuk është aktiv." };
  }

  const now = new Date().toISOString();
  await db
    .delete(inventoryLines)
    .where(eq(inventoryLines.sessionId, sessionId));
  await db
    .delete(inventorySectorCounts)
    .where(eq(inventorySectorCounts.sessionId, sessionId));
  await db
    .delete(inventorySnapshots)
    .where(eq(inventorySnapshots.sessionId, sessionId));
  await db
    .update(inventorySessions)
    .set({ status: "cancelled", closedAt: now })
    .where(eq(inventorySessions.id, sessionId));

  return { ok: true as const };
}

async function resolveSectorForZone(sessionId: number, zone: string) {
  const db = await getDb();
  const counting = await dbOne(
    db
      .select({ id: inventorySectorCounts.id })
      .from(inventorySectorCounts)
      .where(
        and(
          eq(inventorySectorCounts.sessionId, sessionId),
          eq(inventorySectorCounts.zone, zone),
          eq(inventorySectorCounts.status, "counting")
        )
      )
      .orderBy(desc(inventorySectorCounts.startedAt))
  );
  if (counting) return counting.id;

  const closed = await dbOne(
    db
      .select({ id: inventorySectorCounts.id })
      .from(inventorySectorCounts)
      .where(
        and(
          eq(inventorySectorCounts.sessionId, sessionId),
          eq(inventorySectorCounts.zone, zone),
          eq(inventorySectorCounts.status, "closed")
        )
      )
      .orderBy(desc(inventorySectorCounts.closedAt))
  );
  return closed?.id ?? null;
}

export async function reopenSectorCount(input: { sectorCountId: number }) {
  const db = await getDb();
  const sector = await dbOne(
    db
      .select()
      .from(inventorySectorCounts)
      .where(eq(inventorySectorCounts.id, input.sectorCountId))
  );
  if (!sector || sector.status !== "closed") {
    return { ok: false as const, error: "Sektori nuk është i mbyllur." };
  }

  const session = await dbOne(
    db
      .select()
      .from(inventorySessions)
      .where(eq(inventorySessions.id, sector.sessionId))
  );
  if (!session || session.status !== "open") {
    return { ok: false as const, error: "Sesioni i inventarit nuk është aktiv." };
  }

  const otherOpen = await dbOne(
    db
      .select({ zone: inventorySectorCounts.zone })
      .from(inventorySectorCounts)
      .where(
        and(
          eq(inventorySectorCounts.sessionId, sector.sessionId),
          eq(inventorySectorCounts.status, "counting")
        )
      )
  );
  if (otherOpen) {
    return {
      ok: false as const,
      error: `Mbyll ose rihap sektorin e hapur së pari: ${otherOpen.zone}`,
    };
  }

  await db
    .update(inventorySectorCounts)
    .set({
      status: "counting",
      closedAt: null,
      closedByEmployeeId: null,
    })
    .where(eq(inventorySectorCounts.id, input.sectorCountId));

  return {
    ok: true as const,
    sector: await dbOne(
      db
        .select()
        .from(inventorySectorCounts)
        .where(eq(inventorySectorCounts.id, input.sectorCountId))
    ),
  };
}

export async function updateInventoryLine(input: {
  lineId: number;
  ean?: string;
  quantityM2?: number;
  locationId?: number;
  zone?: string;
  notes?: string;
}) {
  const db = await getDb();
  const existing = await dbOne(
    db
      .select({
        id: inventoryLines.id,
        sessionId: inventoryLines.sessionId,
        ean: inventoryLines.ean,
        quantityM2: inventoryLines.quantityM2,
        locationId: inventoryLines.locationId,
        zone: inventoryLines.zone,
        sectorCountId: inventoryLines.sectorCountId,
        notes: inventoryLines.notes,
      })
      .from(inventoryLines)
      .where(eq(inventoryLines.id, input.lineId))
  );
  if (!existing) {
    return { ok: false as const, error: "Rreshti i numërimit nuk u gjet." };
  }

  const session = await dbOne(
    db
      .select()
      .from(inventorySessions)
      .where(eq(inventorySessions.id, existing.sessionId))
  );
  if (!session || !sessionAllowsAdminLineEdits(session.status)) {
    return {
      ok: false as const,
      error: "Nuk mund të ndryshohet ky rresht.",
    };
  }

  const ean = (input.ean ?? existing.ean ?? "").trim();
  const quantityM2 = input.quantityM2 ?? existing.quantityM2;
  const zone = (input.zone ?? existing.zone ?? "").trim();
  const locationId = input.locationId ?? existing.locationId;

  if (!ean) {
    return { ok: false as const, error: "EAN është i detyrueshëm." };
  }
  if (!zone) {
    return { ok: false as const, error: "Zgjidh zonën e depo." };
  }
  if (!locationId) {
    return { ok: false as const, error: "Zgjidh vendndodhjen në depo." };
  }
  if (quantityM2 <= 0) {
    return { ok: false as const, error: "Sasia në m² duhet të jetë më e madhe se 0." };
  }

  const locCheck = await validateLocationInZone(locationId, zone);
  if (!locCheck.ok) return locCheck;

  const product = await upsertProduct({ ean, source: "inventory" });
  const sectorCountId =
    (await resolveSectorForZone(existing.sessionId, zone)) ??
    existing.sectorCountId;

  await db
    .update(inventoryLines)
    .set({
      ean,
      quantityM2,
      locationId,
      zone,
      sectorCountId,
      productId: product?.id ?? null,
      notes:
        input.notes !== undefined
          ? input.notes.trim() || null
          : existing.notes,
    })
    .where(eq(inventoryLines.id, input.lineId));

  return { ok: true as const, lineId: input.lineId };
}

export async function deleteInventoryLine(lineId: number) {
  const db = await getDb();
  const existing = await dbOne(
    db
      .select({
        id: inventoryLines.id,
        sessionId: inventoryLines.sessionId,
      })
      .from(inventoryLines)
      .where(eq(inventoryLines.id, lineId))
  );
  if (!existing) {
    return { ok: false as const, error: "Rreshti i numërimit nuk u gjet." };
  }

  const session = await dbOne(
    db
      .select()
      .from(inventorySessions)
      .where(eq(inventorySessions.id, existing.sessionId))
  );
  if (!session || !sessionAllowsAdminLineEdits(session.status)) {
    return {
      ok: false as const,
      error: "Nuk mund të fshihet ky rresht.",
    };
  }

  await db.delete(inventoryLines).where(eq(inventoryLines.id, lineId));
  return { ok: true as const };
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
        zone: inventoryLines.zone,
        sectorCountId: inventoryLines.sectorCountId,
        locationId: inventoryLines.locationId,
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

async function getLastVarianceReport() {
  const db = await getDb();
  return dbOne(
    db
      .select()
      .from(inventoryVarianceReports)
      .orderBy(desc(inventoryVarianceReports.createdAt))
      .limit(1)
  );
}

async function getPreviousSessionCounts(previousSessionId: number) {
  const db = await getDb();
  const rows = await dbAll(
    db
      .select({
        productId: inventoryLines.productId,
        locationId: inventoryLines.locationId,
        ean: inventoryLines.ean,
        quantityM2: sql<number>`sum(${inventoryLines.quantityM2})`.as(
          "quantityM2"
        ),
      })
      .from(inventoryLines)
      .where(eq(inventoryLines.sessionId, previousSessionId))
      .groupBy(
        inventoryLines.productId,
        inventoryLines.locationId,
        inventoryLines.ean
      )
  );

  const map = new Map<string, number>();
  for (const row of rows) {
    if (!row.locationId) continue;
    const key = `${row.productId ?? row.ean}:${row.locationId}`;
    map.set(key, row.quantityM2 ?? 0);
  }
  return map;
}

export async function getVarianceReport(reportId: number) {
  const db = await getDb();
  const report = await dbOne(
    db
      .select()
      .from(inventoryVarianceReports)
      .where(eq(inventoryVarianceReports.id, reportId))
  );
  if (!report) return null;

  const lines = await dbAll(
    db
      .select({
        id: inventoryVarianceLines.id,
        ean: inventoryVarianceLines.ean,
        zone: inventoryVarianceLines.zone,
        bookM2: inventoryVarianceLines.bookM2,
        countedM2: inventoryVarianceLines.countedM2,
        differenceM2: inventoryVarianceLines.differenceM2,
        previousCountedM2: inventoryVarianceLines.previousCountedM2,
        changeSinceLastM2: inventoryVarianceLines.changeSinceLastM2,
        productName: products.productName,
        locationCode: warehouseLocations.code,
      })
      .from(inventoryVarianceLines)
      .leftJoin(products, eq(inventoryVarianceLines.productId, products.id))
      .leftJoin(
        warehouseLocations,
        eq(inventoryVarianceLines.locationId, warehouseLocations.id)
      )
      .where(eq(inventoryVarianceLines.reportId, reportId))
      .orderBy(desc(sql`abs(${inventoryVarianceLines.differenceM2})`))
  );

  return { report, lines };
}

export async function listVarianceReports(sessionId?: number) {
  const db = await getDb();
  if (sessionId) {
    return dbAll(
      db
        .select()
        .from(inventoryVarianceReports)
        .where(eq(inventoryVarianceReports.sessionId, sessionId))
        .orderBy(desc(inventoryVarianceReports.createdAt))
    );
  }
  return dbAll(
    db
      .select()
      .from(inventoryVarianceReports)
      .orderBy(desc(inventoryVarianceReports.createdAt))
      .limit(20)
  );
}

/** Finalize inventory: apply counted stock + variance report vs book and last report. */
export async function closeInventorySession(sessionId: number) {
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

  const openSectors = await dbAll(
    db
      .select({ zone: inventorySectorCounts.zone })
      .from(inventorySectorCounts)
      .where(
        and(
          eq(inventorySectorCounts.sessionId, sessionId),
          eq(inventorySectorCounts.status, "counting")
        )
      )
  );
  if (openSectors.length > 0) {
    return {
      ok: false as const,
      error: `Mbyll sektorët e hapur së pari: ${openSectors.map((s) => s.zone).join(", ")}`,
    };
  }

  const lines = await dbAll(
    db
      .select({
        productId: inventoryLines.productId,
        locationId: inventoryLines.locationId,
        ean: inventoryLines.ean,
        zone: inventoryLines.zone,
        quantityM2: sql<number>`sum(${inventoryLines.quantityM2})`.as(
          "quantityM2"
        ),
      })
      .from(inventoryLines)
      .where(eq(inventoryLines.sessionId, sessionId))
      .groupBy(
        inventoryLines.productId,
        inventoryLines.locationId,
        inventoryLines.ean,
        inventoryLines.zone
      )
  );

  if (lines.length === 0) {
    return {
      ok: false as const,
      error: "Nuk ka rreshta numërimi — fillo dhe mbyll sektorët para përfundimit.",
    };
  }

  const snapshots = await dbAll(
    db
      .select()
      .from(inventorySnapshots)
      .where(eq(inventorySnapshots.sessionId, sessionId))
  );
  const bookByKey = new Map<string, number>();
  for (const snap of snapshots) {
    bookByKey.set(`${snap.productId}:${snap.locationId}`, snap.quantityM2 ?? 0);
  }

  const previousReport = await getLastVarianceReport();
  let previousCounts = new Map<string, number>();
  if (previousReport) {
    previousCounts = await getPreviousSessionCounts(previousReport.sessionId);
  }

  const now = new Date().toISOString();
  const reportInsert = await dbOne(
    db
      .insert(inventoryVarianceReports)
      .values({
        sessionId,
        previousReportId: previousReport?.id ?? null,
        createdAt: now,
        appliedAt: now,
        totalLines: 0,
        totalVarianceM2: 0,
      })
      .returning({ id: inventoryVarianceReports.id })
  );

  let applied = 0;
  let totalVariance = 0;
  let reportLines = 0;

  for (const line of lines) {
    if (!line.locationId || !line.productId) continue;
    const key = `${line.productId}:${line.locationId}`;
    const bookM2 = bookByKey.get(key) ?? 0;
    const countedM2 = line.quantityM2 ?? 0;
    const differenceM2 = countedM2 - bookM2;
    const previousCountedM2 = previousCounts.get(key) ?? null;
    const changeSinceLastM2 =
      previousCountedM2 != null ? countedM2 - previousCountedM2 : null;

    await db.insert(inventoryVarianceLines).values({
      reportId: reportInsert!.id,
      productId: line.productId,
      ean: line.ean,
      locationId: line.locationId,
      zone: line.zone,
      bookM2,
      countedM2,
      differenceM2,
      previousCountedM2,
      changeSinceLastM2,
    });

    reportLines += 1;
    totalVariance += Math.abs(differenceM2);

    const result = await adjustStockToCount({
      productId: line.productId,
      locationId: line.locationId,
      targetQuantityM2: countedM2,
      notes: `Inventory ${session.name}`,
      referenceType: "inventory",
      referenceId: reportInsert!.id,
    });
    if (result.ok && !result.skipped) applied += 1;
  }

  await db
    .update(inventoryVarianceReports)
    .set({
      totalLines: reportLines,
      totalVarianceM2: Math.round(totalVariance * 100) / 100,
    })
    .where(eq(inventoryVarianceReports.id, reportInsert!.id));

  await db
    .update(inventorySessions)
    .set({ status: "closed", closedAt: now })
    .where(eq(inventorySessions.id, sessionId));

  return {
    ok: true as const,
    applied,
    totalLines: lines.length,
    reportId: reportInsert!.id,
    reportLines,
    totalVarianceM2: Math.round(totalVariance * 100) / 100,
  };
}
