import { NextResponse } from "next/server";
import { getDispatchBoard } from "@/lib/services/dispatch-board";

export const runtime = "nodejs";

export async function GET() {
  const board = await getDispatchBoard();
  return NextResponse.json(board, {
    headers: { "Cache-Control": "no-store" },
  });
}
