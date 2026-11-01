import { NextRequest, NextResponse } from "next/server";
import {
  requireAdministrationRead,
  requireAdministrationWrite,
} from "@/lib/auth/administration-api";
import { runWithTenantOrganizationAsync } from "@/lib/organizations/tenant-context";
import {
  createTransactionEditRequest,
  listPendingEditRequests,
} from "@/lib/services/administration-register";
import { sessionHasPermission, PERMISSIONS } from "@/lib/auth/permissions";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdministrationRead();
  if (!auth.ok) return auth.response;
  return runWithTenantOrganizationAsync(auth.organizationId, async () => {
    const canSeeAll =
      auth.session.role === "admin" ||
      sessionHasPermission(auth.session, PERMISSIONS.administrationApprove);
    if (!canSeeAll) {
      return NextResponse.json({ requests: [] });
    }
    const requests = await listPendingEditRequests(auth.organizationId);
    return NextResponse.json({ requests });
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdministrationWrite();
  if (!auth.ok) return auth.response;
  const body = (await request.json()) as {
    transactionId?: number;
    reason?: string;
    proposedChanges?: Record<string, unknown>;
  };
  return runWithTenantOrganizationAsync(auth.organizationId, async () => {
    try {
      const req = await createTransactionEditRequest(
        auth.organizationId,
        auth.session,
        Number(body.transactionId),
        String(body.reason ?? ""),
        (body.proposedChanges ?? {}) as never
      );
      return NextResponse.json({ request: req });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}
