import { NextRequest, NextResponse } from "next/server";
import { requireApiSessionNoSalesWrite } from "@/lib/auth/api-guard";
import { clearOrderAssignments } from "@/lib/services/orders";
import type { AssignmentClearScope } from "@/lib/services/orders";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSessionNoSalesWrite(request.method);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const force = Boolean(body.force);
  const adminPin = body.adminPin ? String(body.adminPin) : undefined;
  const scope = body.scope as AssignmentClearScope | undefined;

  const result = await clearOrderAssignments(Number(id), { force, adminPin, scope });

  if (!result.ok) {
    const status =
      "requiresPin" in result && result.requiresPin
        ? 403
        : "requiresForce" in result && result.requiresForce
          ? 409
          : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}
