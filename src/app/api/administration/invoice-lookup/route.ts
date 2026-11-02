import { NextRequest, NextResponse } from "next/server";
import { requireAdministrationRead } from "@/lib/auth/administration-api";
import { runWithTenantOrganizationAsync } from "@/lib/organizations/tenant-context";
import { getOrderByInvoiceNumber } from "@/lib/services/orders";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireAdministrationRead();
  if (!auth.ok) return auth.response;
  const invoice = request.nextUrl.searchParams.get("invoice")?.trim();
  if (!invoice) {
    return NextResponse.json({ error: "invoice is required" }, { status: 400 });
  }

  return runWithTenantOrganizationAsync(auth.organizationId, async () => {
    const order = await getOrderByInvoiceNumber(invoice);
    if (!order) {
      return NextResponse.json({ found: false as const });
    }
    return NextResponse.json({
      found: true as const,
      orderId: order.id,
      invoiceNumber: order.invoiceNumber,
      customerName: order.customerName,
      priceCents: Math.round(Number(order.price) * 100),
      orderDate: order.orderDate,
      status: order.status,
      salesEmployeeId: order.salesEmployeeId ?? null,
      salesAgentName: order.salesAgentName ?? null,
    });
  });
}
