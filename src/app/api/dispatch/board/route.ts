import { NextResponse } from "next/server";
import { getDispatchBoard } from "@/lib/services/dispatch-board";

export const runtime = "nodejs";

export async function GET() {
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
}
