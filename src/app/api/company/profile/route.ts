import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  getOrganizationProfile,
  listOrganizationUnits,
} from "@/lib/services/organizations";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireAdmin();
    const organizationId = session.organizationId;
    if (!organizationId) {
      return NextResponse.json({ profile: null, units: [] });
    }
    const [profile, units] = await Promise.all([
      getOrganizationProfile(organizationId),
      listOrganizationUnits(organizationId),
    ]);
    return NextResponse.json({ profile, units, organizationId });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
