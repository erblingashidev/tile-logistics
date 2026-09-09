import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { applyFeatureFlagsCookie } from "@/lib/features/cookie";
import { getFeatureFlagsForSession } from "@/lib/services/feature-flags";
import {
  getOrganizationById,
  isOnboardingComplete,
} from "@/lib/services/organizations";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await requirePlatformAdmin();
    const body = (await request.json()) as { organizationId?: number };
    const organizationId = Number(body.organizationId);
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return NextResponse.json(
        { error: "Valid organizationId is required." },
        { status: 400 }
      );
    }

    const org = await getOrganizationById(organizationId);
    if (!org) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }
    if (org.status !== "active") {
      return NextResponse.json(
        { error: "That company is not active." },
        { status: 400 }
      );
    }

    const onboardingComplete = await isOnboardingComplete(organizationId);
    const user = {
      role: "admin" as const,
      adminId: session.adminId,
      name: session.name,
      username: session.username,
      title: session.title ?? null,
      organizationId,
      isPlatformAdmin: true,
      onboardingComplete,
    };

    const token = await createSessionToken(user);
    const response = NextResponse.json({
      ok: true,
      organizationId,
      organizationName: org.name,
      redirect: onboardingComplete ? "/" : "/onboarding",
    });
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
