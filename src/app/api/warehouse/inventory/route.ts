import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  addInventoryLine,
  closeInventorySession,
  getOpenInventorySession,
  listInventoryLines,
  listInventorySessions,
  startInventorySession,
} from "@/lib/services/inventory";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    if (sessionId) {
      return NextResponse.json(await listInventoryLines(Number(sessionId)));
    }
    const open = await getOpenInventorySession();
    const sessions = await listInventorySessions();
    return NextResponse.json({ sessions, open });
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

    if (body.action === "line") {
      const result = await addInventoryLine({
        sessionId: Number(body.sessionId),
        ean: String(body.ean ?? ""),
        quantityM2: Number(body.quantityM2),
        locationId: body.locationId ? Number(body.locationId) : undefined,
        notes: body.notes,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    if (body.action === "close") {
      const result = await closeInventorySession(
        Number(body.sessionId),
        Number(body.defaultLocationId)
      );
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
