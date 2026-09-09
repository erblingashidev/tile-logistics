import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import {
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { dbOne } from "@/lib/db/query";
import { admins } from "@/lib/db/schema";
import { applyFeatureFlagsCookie } from "@/lib/features/cookie";
import { getFeatureFlagsForSession } from "@/lib/services/feature-flags";
import { isOnboardingComplete } from "@/lib/services/organizations";

export const runtime = "nodejs";

/** Rebuild session cookie after onboarding or profile changes. */
export async function POST() {
  try {
    const session = await requireAdmin();
    if (session.adminId === 0) {
      return NextResponse.json({ ok: true });
    }

    const db = await getDb();
    const row = await dbOne(
      db.select().from(admins).where(eq(admins.id, session.adminId))
    );
    if (!row || row.isActive !== 1) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizationId = row.organizationId ?? null;
    const onboardingComplete =
      organizationId != null
        ? await isOnboardingComplete(organizationId)
        : true;

    const user = {
      role: "admin" as const,
      adminId: row.id,
      name: row.name,
      username: row.username,
      title: row.title ?? null,
      organizationId,
      isPlatformAdmin: row.isPlatformAdmin === 1,
      onboardingComplete,
    };

    const token = await createSessionToken(user);
    const response = NextResponse.json({ ok: true, onboardingComplete });
    response.cookies.set(
      sessionCookieOptions().name,
      token,
      sessionCookieOptions()
    );
    applyFeatureFlagsCookie(response, await getFeatureFlagsForSession(user));
    return response;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
