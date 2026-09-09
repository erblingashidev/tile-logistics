import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth/session";
import {
  loginAdmin,
  loginEmployee,
  employeeLoginRedirect,
} from "@/lib/auth";
import { applyFeatureFlagsCookie } from "@/lib/features/cookie";
import { getFeatureFlagsForSession } from "@/lib/services/feature-flags";
import {
  ensureLegacyAgimiOrganizationReady,
  isOnboardingComplete,
  LEGACY_AGIMI_ORGANIZATION_ID,
  repairAgimiAdminLogin,
} from "@/lib/services/organizations";
import { isLegacyAgimiOrganization } from "@/lib/organizations/constants";
import {
  checkRateLimit,
  clientIpFromRequest,
} from "@/lib/auth/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
  const ip = clientIpFromRequest(request);
  if (!checkRateLimit(`login:${ip}`, 12, 60_000)) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again in a minute." },
      { status: 429 }
    );
  }

  const body = await request.json();
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");

  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required" },
      { status: 400 }
    );
  }

  const user =
    (await loginAdmin(username, password)) ??
    (await loginEmployee(username, password));

  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  if (user.role === "admin") {
    const platformAdmin =
      user.adminId === 0 || user.isPlatformAdmin === true;
    if (platformAdmin) {
      user.organizationId = null;
      user.onboardingComplete = true;
    } else {
      const orgId = user.organizationId ?? LEGACY_AGIMI_ORGANIZATION_ID;
      if (isLegacyAgimiOrganization(orgId)) {
        if (user.adminId > 0) await repairAgimiAdminLogin(user.adminId);
        else await ensureLegacyAgimiOrganizationReady();
        user.organizationId = LEGACY_AGIMI_ORGANIZATION_ID;
        user.onboardingComplete = true;
      } else {
        user.organizationId = orgId;
        user.onboardingComplete = await isOnboardingComplete(orgId);
      }
    }
  }

  const token = await createSessionToken(user);
  let redirect =
    user.role === "admin" ? "/" : employeeLoginRedirect(user.roles);
  if (user.role === "admin") {
    if (user.adminId === 0 || user.isPlatformAdmin === true) {
      redirect = "/platform/companies";
    } else if (user.onboardingComplete === false) {
      redirect = "/onboarding";
    }
  }

  const response = NextResponse.json({
    user: {
      role: user.role,
      name: user.name,
      employeeId: user.role === "employee" ? user.employeeId : undefined,
      roles: user.role === "employee" ? user.roles : undefined,
    },
    redirect,
  });

  response.cookies.set(
    sessionCookieOptions().name,
    token,
    sessionCookieOptions()
  );
  applyFeatureFlagsCookie(response, await getFeatureFlagsForSession(user));

  return response;
  } catch (err) {
    console.error("[auth/login POST]", err);
    return NextResponse.json(
      { error: "Login failed — please try again in a moment." },
      { status: 500 }
    );
  }
}
