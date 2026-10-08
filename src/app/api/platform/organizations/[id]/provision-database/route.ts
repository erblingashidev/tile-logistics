import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  getOrganizationById,
  getOrgSettingValue,
} from "@/lib/services/organizations";
import {
  provisionOrganizationDatabase,
  TENANT_DATABASE_ISOLATED_KEY,
} from "@/lib/db/tenant-database";

export const runtime = "nodejs";

/** Platform super-admin: create or confirm an isolated database for one company. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePlatformAdmin();
    const organizationId = Number((await params).id);
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return NextResponse.json({ error: "Invalid company id." }, { status: 400 });
    }
    const org = await getOrganizationById(organizationId);
    if (!org) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    const result = await provisionOrganizationDatabase(
      organizationId,
      org.slug
    );
    const isolated =
      (await getOrgSettingValue(organizationId, TENANT_DATABASE_ISOLATED_KEY)) ===
      "true";

    return NextResponse.json({
      ok: true,
      organizationId,
      slug: org.slug,
      mode: result.mode,
      isolated,
      databaseUrl: result.url ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
