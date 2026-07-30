import { NextResponse } from "next/server";
import { requireEmployee } from "@/lib/auth";
import { assertEmployeeWorkflowEnabled } from "@/lib/services/feature-flags";
import {
  getOrderPrepareLines,
  prepareOrderWithPicks,
  type OrderPickLineInput,
} from "@/lib/services/order-picks";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const blocked = await assertEmployeeWorkflowEnabled();
    if (!blocked.ok) {
      return NextResponse.json({ error: blocked.error }, { status: 403 });
    }
    const session = await requireEmployee();
    if (!session.roles.includes("picker")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const orderId = Number(id);
    if (!Number.isFinite(orderId) || orderId <= 0) {
      return NextResponse.json({ error: "Invalid order" }, { status: 400 });
    }
    const lines = await getOrderPrepareLines(orderId);
    return NextResponse.json({ lines });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const blocked = await assertEmployeeWorkflowEnabled();
    if (!blocked.ok) {
      return NextResponse.json({ error: blocked.error }, { status: 403 });
    }
    const session = await requireEmployee();
    if (!session.roles.includes("picker")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const orderId = Number(id);
    if (!Number.isFinite(orderId) || orderId <= 0) {
      return NextResponse.json({ error: "Invalid order" }, { status: 400 });
    }

    const body = await request.json();
    const picks = (body.picks ?? []) as OrderPickLineInput[];

    const result = await prepareOrderWithPicks({
      orderId,
      employeeId: session.employeeId,
      employeeRoles: session.roles,
      picks,
      notes: body.notes,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[portal/prepare]", err);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
