import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth";
import { listPendingApplications } from "@/lib/services/organizations";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requirePlatformAdmin();
    const applications = await listPendingApplications();
    return NextResponse.json({
      applications: applications.map((a) => ({
        id: a.id,
        orgName: a.orgName,
        slug: a.slug,
        contactName: a.contactName,
        contactEmail: a.contactEmail,
        adminUsername: a.adminUsername,
        companyCategory: a.companyCategory,
        message: a.message,
        createdAt: a.createdAt,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
