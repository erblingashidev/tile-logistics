import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  isManualDispatchMode,
  setManualDispatchMode,
} from "@/lib/services/feature-flags";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdmin();
    const manualDispatchMode = await isManualDispatchMode();
    return NextResponse.json({ manualDispatchMode });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json();
    if (typeof body.manualDispatchMode === "boolean") {
      await setManualDispatchMode(body.manualDispatchMode);
    }
    return NextResponse.json({
      manualDispatchMode: await isManualDispatchMode(),
    });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
