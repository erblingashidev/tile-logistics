import { NextRequest, NextResponse } from "next/server";
import { requireApiTenantSession } from "@/lib/auth/api-guard";
import { sessionHasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { runWithTenantOrganizationAsync } from "@/lib/organizations/tenant-context";
import type { LogCategory } from "@/lib/log-messages";
import { listLogs } from "@/lib/services/orders";
import { listRegisterAuditLogEntries } from "@/lib/services/administration-register";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireApiTenantSession();
  if (!auth.ok) return auth.response;
  if (
    auth.session.role !== "admin" &&
    !sessionHasPermission(auth.session, PERMISSIONS.logsRead)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const category = sp.get("category") as LogCategory | null;
  const filters = {
    dateFrom: sp.get("dateFrom") ?? undefined,
    dateTo: sp.get("dateTo") ?? undefined,
    search: sp.get("search") ?? undefined,
    employeeId: sp.get("employeeId") ? Number(sp.get("employeeId")) : undefined,
  };

  return runWithTenantOrganizationAsync(auth.organizationId, async () => {
    const includeActivity = category !== "administration";
    const includeRegisterAudit = !category || category === "administration";

    const [activityLogs, registerLogs] = await Promise.all([
      includeActivity
        ? listLogs({
            ...filters,
            category: category ?? undefined,
          })
        : Promise.resolve([]),
      includeRegisterAudit
        ? listRegisterAuditLogEntries(auth.organizationId, filters)
        : Promise.resolve([]),
    ]);

    const merged = [
      ...activityLogs.map((log) => ({ ...log, source: "activity" as const })),
      ...registerLogs,
    ]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 500);

    return NextResponse.json(merged);
  });
}
