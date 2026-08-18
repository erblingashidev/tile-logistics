import { NextResponse } from "next/server";
import type { FeatureFlags } from "@/lib/features/catalog";

export const FEATURE_FLAGS_COOKIE = "tl_features";

export function serializeFeatureFlagsCookie(flags: FeatureFlags): string {
  return JSON.stringify({ wms: flags.warehouseWms ? 1 : 0 });
}

export function parseFeatureFlagsCookie(
  value?: string | null
): { warehouseWms: boolean } {
  if (!value) return { warehouseWms: false };
  try {
    const parsed = JSON.parse(value) as { wms?: number | boolean };
    return { warehouseWms: parsed.wms === 1 || parsed.wms === true };
  } catch {
    return { warehouseWms: false };
  }
}

export function featureFlagsCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
  };
}

export function applyFeatureFlagsCookie(
  response: NextResponse,
  flags: FeatureFlags
): NextResponse {
  response.cookies.set(
    FEATURE_FLAGS_COOKIE,
    serializeFeatureFlagsCookie(flags),
    featureFlagsCookieOptions()
  );
  return response;
}
