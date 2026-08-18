import { NextResponse } from "next/server";
import { applyFeatureFlagsCookie } from "@/lib/features/cookie";
import { getSession } from "@/lib/auth";
import { getAdmin } from "@/lib/services/admins";
import { getEmployee } from "@/lib/services/employees";
import { getFeatureFlags } from "@/lib/services/feature-flags";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const features = await getFeatureFlags();

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
        },
        features,
      }),
      features
    );
  }

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
}
