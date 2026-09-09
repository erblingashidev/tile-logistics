import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  approveOrganizationApplication,
  OrganizationError,
  rejectOrganizationApplication,
} from "@/lib/services/organizations";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePlatformAdmin();
    const { id } = await context.params;
    const applicationId = Number(id);
    if (!Number.isFinite(applicationId) || applicationId <= 0) {
      return NextResponse.json({ error: "Invalid application." }, { status: 400 });
    }

    const body = (await request.json()) as {
      action?: "approve" | "reject";
      reason?: string;
    };

    if (body.action === "approve") {
      const result = await approveOrganizationApplication(
        applicationId,
        session.adminId
      );
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "reject") {
      await rejectOrganizationApplication(
        applicationId,
        session.adminId,
        body.reason
      );
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    if (err instanceof OrganizationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
