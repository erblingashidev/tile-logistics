import { NextRequest, NextResponse } from "next/server";
import { requireSalesStaffSession } from "@/lib/auth/api-guard";
import { logActivity } from "@/lib/logger";
import {
  resolveTenantOrganizationId,
  runWithTenantOrganizationAsync,
} from "@/lib/organizations/tenant-context";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await requireSalesStaffSession();
  if (!auth.ok) return auth.response;

  const body = (await request.json()) as {
    message?: string;
    clientName?: string;
    invoiceNumber?: string;
  };
  const message = String(body.message ?? "").trim();
  if (message.length < 3) {
    return NextResponse.json(
      { error: "Describe what management should update." },
      { status: 400 }
    );
  }

  try {
    const organizationId = await resolveTenantOrganizationId();
    await runWithTenantOrganizationAsync(organizationId, async () => {
      await logActivity(
        "sales_finance_change_request",
        "finance",
        auth.session.employeeId,
        `Sales (${auth.session.name}): ${message}`,
        {
          category: "administration",
          details: {
            employeeId: auth.session.employeeId,
            employeeName: auth.session.name,
            clientName: body.clientName?.trim() || null,
            invoiceNumber: body.invoiceNumber?.trim() || null,
          },
        }
      );
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Request failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
