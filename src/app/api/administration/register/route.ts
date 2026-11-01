import { NextRequest, NextResponse } from "next/server";
import {
  requireAdministrationRead,
  requireAdministrationWrite,
} from "@/lib/auth/administration-api";
import { runWithTenantOrganizationAsync } from "@/lib/organizations/tenant-context";
import {
  closeRegisterSession,
  getOpenRegisterWithReconciliation,
  listClosedRegisterSessions,
  openRegisterSession,
} from "@/lib/services/administration-register";
import { sessionHasPermission, PERMISSIONS } from "@/lib/auth/permissions";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireAdministrationRead();
  if (!auth.ok) return auth.response;
  const sp = request.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  return runWithTenantOrganizationAsync(auth.organizationId, async () => {
    if (from && to) {
      const sessions = await listClosedRegisterSessions(
        auth.organizationId,
        from,
        to
      );
      return NextResponse.json({ sessions });
    }
    const open = await getOpenRegisterWithReconciliation(auth.organizationId);
    return NextResponse.json(open);
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdministrationWrite();
  if (!auth.ok) return auth.response;
  const body = (await request.json()) as {
    action?: string;
    openingFloatCents?: number;
    closingCashCountedCents?: number;
    closingNotes?: string;
  };

  return runWithTenantOrganizationAsync(auth.organizationId, async () => {
    try {
      if (body.action === "close") {
        const canClose =
          auth.session.role === "admin" ||
          sessionHasPermission(auth.session, PERMISSIONS.administrationApprove) ||
          sessionHasPermission(auth.session, PERMISSIONS.administrationWrite);
        if (!canClose) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const session = await closeRegisterSession(
          auth.organizationId,
          auth.session,
          Number(body.closingCashCountedCents ?? 0),
          body.closingNotes
        );
        return NextResponse.json({
          session,
          expectedCashCents: session.expectedCashCents,
          cashVarianceCents: session.cashVarianceCents,
        });
      }

      const session = await openRegisterSession(
        auth.organizationId,
        auth.session,
        Number(body.openingFloatCents ?? 0)
      );
      return NextResponse.json({ session });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}
