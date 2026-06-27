import { NextResponse } from "next/server";
import {
  employeeCanUseWms,
  requireEmployee,
} from "@/lib/auth";
import {
  addInventoryLine,
  getOpenInventorySession,
} from "@/lib/services/inventory";
import {
  listWarehouseLocations,
  receiveStock,
} from "@/lib/services/stock";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireEmployee();
    if (!employeeCanUseWms(session)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const [locations, openSession] = await Promise.all([
      listWarehouseLocations(),
      getOpenInventorySession(),
    ]);
    return NextResponse.json({ locations, openSession });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireEmployee();
    if (!employeeCanUseWms(session)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await request.json();

    if (body.action === "receive") {
      const result = await receiveStock({
        ean: String(body.ean ?? ""),
        quantityM2: Number(body.quantityM2),
        locationId: Number(body.locationId),
        employeeId: session.employeeId,
        productName: body.productName,
        notes: body.notes,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json(result);
    }

    if (body.action === "inventory") {
      const open = await getOpenInventorySession();
      if (!open) {
        return NextResponse.json(
          { error: "Nuk ka inventar të hapur. Kontaktoni adminin." },
          { status: 400 }
        );
      }
      const result = await addInventoryLine({
        sessionId: open.id,
        ean: String(body.ean ?? ""),
        quantityM2: Number(body.quantityM2),
        locationId: body.locationId ? Number(body.locationId) : undefined,
        employeeId: session.employeeId,
        notes: body.notes,
      });
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
