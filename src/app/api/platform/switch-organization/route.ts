import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth";
import {
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { applyFeatureFlagsCookie } from "@/lib/features/cookie";
import { getFeatureFlagsForSession } from "@/lib/services/feature-flags";
import {
  enrichSessionWithOrganizationSlug,
  getOrganizationById,
  getOrganizationBySlug,
  isOnboardingComplete,
} from "@/lib/services/organizations";
import { postLoginRedirect } from "@/lib/auth/redirects";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await requirePlatformAdmin();
    const body = (await request.json()) as {
      organizationId?: number;
      slug?: string;
    };
    let organizationId = Number(body.organizationId);
    let org =
      Number.isFinite(organizationId) && organizationId > 0
        ? await getOrganizationById(organizationId)
        : null;
    if (!org && body.slug?.trim()) {
      org = await getOrganizationBySlug(body.slug);
      organizationId = org?.id ?? NaN;
    }
    if (!org || !Number.isFinite(organizationId) || organizationId <= 0) {
      return NextResponse.json(
        { error: "Valid organizationId or slug is required." },
        { status: 400 }
      );
    }
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
    const user = await enrichSessionWithOrganizationSlug({
      role: "admin" as const,
      adminId: session.adminId,
      name: session.name,
      username: session.username,
      title: session.title ?? null,
      organizationId,
      isPlatformAdmin: true,
      onboardingComplete,
    });

    const token = await createSessionToken(user);
    const response = NextResponse.json({
      ok: true,
      organizationId,
      organizationName: org.name,
      organizationSlug: org.slug,
      redirect: postLoginRedirect(user),
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
