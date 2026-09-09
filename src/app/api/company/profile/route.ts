import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { DEFAULT_ORGANIZATION_ID } from "@/lib/organizations/constants";
import {
  getOrganizationDisplayName,
  getOrganizationProfile,
  getOrganizationWarehouse,
  listOrganizationUnits,
} from "@/lib/services/organizations";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireAdmin();
    const organizationId = session.organizationId ?? DEFAULT_ORGANIZATION_ID;
    if (!organizationId) {
      return NextResponse.json({ profile: null, units: [], organizationName: null });
    }
    const [profile, units, organizationName, warehouse] = await Promise.all([
      getOrganizationProfile(organizationId),
      listOrganizationUnits(organizationId),
      getOrganizationDisplayName(organizationId),
      getOrganizationWarehouse(organizationId),
    ]);
    return NextResponse.json({
      profile,
      units,
      warehouse,
      organizationName,
      organizationId,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
