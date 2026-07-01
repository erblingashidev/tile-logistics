import { NextRequest, NextResponse } from "next/server";
import { requireSalesStaffSession } from "@/lib/auth/api-guard";
import { isSalesAdmin } from "@/lib/employee-categories";
import {
  listOrdersForSalesPortal,
  listSalesAgentsForAdmin,
} from "@/lib/services/sales-portal";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireSalesStaffSession();
  if (!auth.ok) return auth.response;

  const sp = request.nextUrl.searchParams;
  const salesAgentIdRaw = sp.get("salesAgentId");

  try {
    if (sp.get("view") === "agents") {
      if (!isSalesAdmin(auth.session.roles)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const agents = await listSalesAgentsForAdmin(auth.session.employeeId);
      return NextResponse.json(agents);
    }

    const orders = await listOrdersForSalesPortal(auth.session, {
      search: sp.get("search") ?? undefined,
      hideDelivered: sp.get("hideDelivered") === "true",
      salesAgentId: salesAgentIdRaw ? Number(salesAgentIdRaw) : undefined,
    });

    return NextResponse.json(orders, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load orders";
    const status = message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
