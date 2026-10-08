import { NextRequest, NextResponse } from "next/server";
import {
  runApiWithTenant,
  runApiWithTenantNoSalesWrite,
} from "@/lib/auth/api-guard";
import {
  getOrder,
  updateOrder,
  deleteOrder,
  type OrderPayload,
} from "@/lib/services/orders";
import { resolveSalesOwnership } from "@/lib/services/sales-portal";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return runApiWithTenant(async () => {
    const { id } = await params;
    const order = await getOrder(Number(id));
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(order);
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return runApiWithTenantNoSalesWrite(request.method, async () => {
    const { id } = await params;
    const body = (await request.json()) as OrderPayload;
    try {
      const ownership = await resolveSalesOwnership({
        salesAgentName: body.salesAgentName,
        salesEmployeeId: body.salesEmployeeId,
      });
      const order = await updateOrder(Number(id), {
        ...body,
        location: body.location?.trim() || body.region || "—",
        salesEmployeeId: ownership.salesEmployeeId,
        salesAgentName: ownership.salesAgentName,
      });
      if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(order);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update order";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return runApiWithTenantNoSalesWrite(request.method, async () => {
    const { id } = await params;
    const ok = await deleteOrder(Number(id));
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  });
}
