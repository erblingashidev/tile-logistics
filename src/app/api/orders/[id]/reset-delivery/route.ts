import { NextRequest, NextResponse } from "next/server";
import { resetOrderDelivery } from "@/lib/services/orders";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const adminPin = String(body.adminPin ?? "");

  const result = await resetOrderDelivery(Number(id), { adminPin });

  if (!result.ok) {
    const status = "requiresPin" in result && result.requiresPin ? 403 : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}
