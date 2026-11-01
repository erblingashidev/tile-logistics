import { NextRequest, NextResponse } from "next/server";
import { requireAdministrationRead } from "@/lib/auth/administration-api";
import { runWithTenantOrganizationAsync } from "@/lib/organizations/tenant-context";
import { reviewTransactionEditRequest } from "@/lib/services/administration-register";
import { sessionHasPermission, PERMISSIONS } from "@/lib/auth/permissions";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdministrationRead();
  if (!auth.ok) return auth.response;
  if (
    auth.session.role !== "admin" &&
    !sessionHasPermission(auth.session, PERMISSIONS.administrationApprove)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const requestId = Number(id);
  const body = (await request.json()) as {
    decision?: "approve" | "reject";
    reviewNotes?: string;
  };
  const approve = body.decision === "approve";
  return runWithTenantOrganizationAsync(auth.organizationId, async () => {
    try {
      const result = await reviewTransactionEditRequest(
        auth.organizationId,
        auth.session,
        requestId,
        approve,
        body.reviewNotes
      );
      return NextResponse.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      const status = message === "Forbidden" ? 403 : 400;
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}
