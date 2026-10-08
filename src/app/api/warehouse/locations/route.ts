import { NextResponse } from "next/server";
import { runApiCompanyAdmin } from "@/lib/auth/api-guard";
import {
  createWarehouseLocation,
  listLocationsWithStockSummary,
} from "@/lib/services/stock";

export const runtime = "nodejs";

export async function GET() {
  return runApiCompanyAdmin(async () =>
    NextResponse.json(await listLocationsWithStockSummary())
  );
}

export async function POST(request: Request) {
  return runApiCompanyAdmin(async () => {
    const body = await request.json();
    if (!body.code?.trim()) {
      return NextResponse.json({ error: "Code required" }, { status: 400 });
    }
    const loc = await createWarehouseLocation({
      code: body.code,
      zone: body.zone,
      label: body.label,
      notes: body.notes,
    });
    return NextResponse.json(loc);
  });
}
