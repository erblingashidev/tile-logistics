import { NextResponse } from "next/server";
import { runApiWithTenant } from "@/lib/auth/api-guard";
import { getDispatchBoard } from "@/lib/services/dispatch-board";

export const runtime = "nodejs";

export async function GET() {
  return runApiWithTenant(async () => {
    try {
      const board = await getDispatchBoard();
      return NextResponse.json(board, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (err) {
      console.error("[dispatch/board]", err);
      const message =
        err instanceof Error ? err.message : "Could not load dispatch board";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
