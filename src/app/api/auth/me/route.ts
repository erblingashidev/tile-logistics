import { NextResponse } from "next/server";
import { applyFeatureFlagsCookie } from "@/lib/features/cookie";
import { getSession } from "@/lib/auth";
import { getAdmin } from "@/lib/services/admins";
import { getEmployee } from "@/lib/services/employees";
import { getFeatureFlagsForSession } from "@/lib/services/feature-flags";
import { runWithTenantOrganizationAsync } from "@/lib/organizations/tenant-context";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const features = await getFeatureFlagsForSession(session);

  if (session.role === "admin") {
    if (session.adminId > 0) {
      const profile = await getAdmin(session.adminId);
      if (profile) {
        return applyFeatureFlagsCookie(
          NextResponse.json({
            user: {
              role: "admin" as const,
              adminId: profile.id,
              name: profile.name,
              username: profile.username,
              title: profile.title,
              email: profile.email,
              isActive: profile.isActive,
              createdAt: profile.createdAt,
              lastLoginAt: profile.lastLoginAt,
              organizationId: session.organizationId ?? null,
              organizationSlug: session.organizationSlug ?? null,
              isPlatformAdmin: session.isPlatformAdmin === true,
              onboardingComplete: session.onboardingComplete !== false,
            },
            features,
          }),
          features
        );
      }
    }

    return applyFeatureFlagsCookie(
      NextResponse.json({
        user: {
          ...session,
          email: null,
          isActive: true,
          createdAt: null,
          lastLoginAt: null,
          isPlatformAdmin: session.isPlatformAdmin === true,
          onboardingComplete: session.onboardingComplete !== false,
        },
        features,
      }),
      features
    );
  }

  const orgId = session.organizationId;
  if (orgId == null || orgId <= 0) {
    return NextResponse.json(
      { error: "Employee session is missing company context." },
      { status: 403 }
    );
  }

  return runWithTenantOrganizationAsync(orgId, async () => {
    const profile = await getEmployee(session.employeeId);
    return applyFeatureFlagsCookie(
      NextResponse.json({
        user: {
          ...session,
          status: profile?.status ?? "available",
          username: profile?.username ?? null,
        },
        features,
      }),
      features
    );
  });
}
