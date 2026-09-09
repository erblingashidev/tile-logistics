import { NextResponse } from "next/server";
import { getSession, requireAdmin } from "@/lib/auth";
import { applyFeatureFlagsCookie } from "@/lib/features/cookie";
import { effectiveFeatureFlags } from "@/lib/features/catalog";
import {
  getFeatureFlagsForSession,
  updateFeatureFlagsForSession,
} from "@/lib/services/feature-flags";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const flags = await getFeatureFlagsForSession(session);
    const response = NextResponse.json(flags);
    applyFeatureFlagsCookie(response, effectiveFeatureFlags(flags));
    return response;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireAdmin();
    const body = await request.json().catch(() => ({}));
    const flags = await updateFeatureFlagsForSession(session, body);
    const response = NextResponse.json(flags);
    applyFeatureFlagsCookie(response, effectiveFeatureFlags(flags));
    return response;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
