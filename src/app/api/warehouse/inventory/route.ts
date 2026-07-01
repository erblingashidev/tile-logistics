import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  addInventoryLine,
  cancelInventorySession,
  closeInventorySession,
  closeSectorCount,
  deleteInventoryLine,
  deleteInventorySession,
  getOpenInventorySession,
  getVarianceReport,
  listInventoryLines,
  listInventorySessions,
  listInventoryZonesWithStatus,
  listSectorCounts,
  listVarianceReports,
  reopenSectorCount,
  startInventorySession,
  startSectorCount,
  updateInventoryLine,
  updateInventorySession,
} from "@/lib/services/inventory";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    const reportId = url.searchParams.get("reportId");

    if (reportId) {
      const report = await getVarianceReport(Number(reportId));
      if (!report) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(report);
    }

    if (sessionId) {
      const id = Number(sessionId);
      const [lines, sectors, zones, reports] = await Promise.all([
        listInventoryLines(id),
        listSectorCounts(id),
        listInventoryZonesWithStatus(id),
        listVarianceReports(id),
      ]);
      return NextResponse.json({ lines, sectors, zones, reports });
    }

    const open = await getOpenInventorySession();
    const sessions = await listInventorySessions();
    const latestReport = (await listVarianceReports())[0] ?? null;
    return NextResponse.json({ sessions, open, latestReport });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json();

    if (body.action === "start") {
      const result = await startInventorySession({
        name: body.name ?? `Inventar ${new Date().getFullYear()}`,
        notes: body.notes,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result.session);
    }

    if (body.action === "start_sector") {
      const result = await startSectorCount({
        sessionId: Number(body.sessionId),
        zone: String(body.zone ?? ""),
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    if (body.action === "close_sector") {
      const result = await closeSectorCount({
        sectorCountId: Number(body.sectorCountId),
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    if (body.action === "line") {
      const result = await addInventoryLine({
        sessionId: Number(body.sessionId),
        ean: String(body.ean ?? ""),
        quantityM2: Number(body.quantityM2),
        locationId: Number(body.locationId),
        zone: String(body.zone ?? ""),
        sectorCountId: Number(body.sectorCountId),
        notes: body.notes,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    if (body.action === "close") {
      const result = await closeInventorySession(Number(body.sessionId));
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    if (body.action === "cancel") {
      const result = await cancelInventorySession(Number(body.sessionId));
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "update_session") {
      const result = await updateInventorySession({
        sessionId: Number(body.sessionId),
        name: body.name,
        notes: body.notes,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result.session);
    }

    if (body.action === "update_line") {
      const result = await updateInventoryLine({
        lineId: Number(body.lineId),
        ean: body.ean,
        quantityM2:
          body.quantityM2 != null ? Number(body.quantityM2) : undefined,
        locationId:
          body.locationId != null ? Number(body.locationId) : undefined,
        zone: body.zone,
        notes: body.notes,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    if (body.action === "delete_line") {
      const result = await deleteInventoryLine(Number(body.lineId));
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "reopen_sector") {
      const result = await reopenSectorCount({
        sectorCountId: Number(body.sectorCountId),
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    if (body.action === "delete_session") {
      const result = await deleteInventorySession(Number(body.sessionId));
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
