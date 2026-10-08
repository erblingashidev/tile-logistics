import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { applyFeatureFlagsCookie } from "@/lib/features/cookie";
import { getFeatureFlagsForSession } from "@/lib/services/feature-flags";
import { enrichSessionWithOrganizationSlug } from "@/lib/services/organizations";

export const runtime = "nodejs";

/** Platform super-admin: drop active company context and return to company picker. */
export async function POST() {
  try {
    const session = await requirePlatformAdmin();
    const user = await enrichSessionWithOrganizationSlug({
      role: "admin",
      adminId: session.adminId,
      name: session.name,
      username: session.username,
      title: session.title ?? null,
      organizationId: null,
      isPlatformAdmin: true,
      onboardingComplete: true,
    });

    const token = await createSessionToken(user);
    const response = NextResponse.json({ ok: true, redirect: "/platform/companies" });
    response.cookies.set(
      sessionCookieOptions().name,
      token,
      sessionCookieOptions()
    );
    applyFeatureFlagsCookie(response, await getFeatureFlagsForSession(user));
    return response;
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
