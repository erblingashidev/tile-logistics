import { NextRequest, NextResponse } from "next/server";
import { bulkClearOrderAssignments } from "@/lib/services/orders";
import type { AssignmentClearScope } from "@/lib/services/orders";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const orderIds = (body.orderIds as number[] | undefined)?.filter(Boolean) ?? [];

  if (orderIds.length === 0) {
    return NextResponse.json({ error: "orderIds required" }, { status: 400 });
  }

  const scope = body.scope as AssignmentClearScope | undefined;
  const adminPin = body.adminPin ? String(body.adminPin) : undefined;
  const force = Boolean(body.force);

  const result = await bulkClearOrderAssignments(orderIds, {
    scope,
    adminPin,
    force,
  });

  return NextResponse.json(result, {
    status: result.ok ? 200 : 409,
  });
}
