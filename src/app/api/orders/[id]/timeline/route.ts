import { NextResponse } from "next/server";
import { listOrderAssignmentTimeline } from "@/lib/services/orders";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const timeline = await listOrderAssignmentTimeline(Number(id));
  return NextResponse.json(timeline);
}
