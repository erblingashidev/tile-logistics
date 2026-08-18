import { NextResponse } from "next/server";
import { getSession, requireAdmin } from "@/lib/auth";
import { applyFeatureFlagsCookie } from "@/lib/features/cookie";
import {
  getFeatureFlags,
  updateFeatureFlagsFromBody,
} from "@/lib/services/feature-flags";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const flags = await getFeatureFlags();
    const response = NextResponse.json(flags);
    applyFeatureFlagsCookie(response, flags);
    return response;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json().catch(() => ({}));
    const flags = await updateFeatureFlagsFromBody(body);
    const response = NextResponse.json(flags);
    applyFeatureFlagsCookie(response, flags);
    return response;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
