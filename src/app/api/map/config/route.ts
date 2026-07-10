import { NextResponse } from "next/server";
import { requireApiSessionNoSalesWrite } from "@/lib/auth/api-guard";
import {
  getMapConfig,
  getMaptilerKey,
  OPENFREEMAP_STYLE_URL,
} from "@/lib/locations/map-config";
import {
  resolveMapTilerKeyHint,
  verifyMapTilerKey,
} from "@/lib/locations/verify-maptiler-key";

export const runtime = "nodejs";

/** Runtime map tile config — validates MapTiler key server-side before sending to browser. */
export async function GET() {
  const auth = await requireApiSessionNoSalesWrite("GET");
  if (!auth.ok) return auth.response;

  const base = getMapConfig();
  const keySuffix = await resolveMapTilerKeyHint();

  if (base.provider !== "maptiler") {
    return NextResponse.json({
      ...base,
      keySuffix: keySuffix ?? null,
      hint: base.hasKey
        ? undefined
        : "No map key on server — using free OpenFreeMap tiles.",
    });
  }

  const key = getMaptilerKey()!;
  const check = await verifyMapTilerKey(key);

  if (check.ok) {
    return NextResponse.json({
      ...base,
      keySuffix,
      maptilerStatus: check.status,
    });
  }

  return NextResponse.json({
    styleUrl: OPENFREEMAP_STYLE_URL,
    attribution: "© OpenStreetMap contributors (MapTiler key invalid — free fallback)",
    provider: "openfreemap" as const,
    hasKey: false,
    keySuffix,
    maptilerStatus: check.status,
    fallbackReason: "maptiler_rejected",
    hint:
      check.status === 403
        ? "MapTiler rejected the API key (403). Create a new key in MapTiler Cloud and set NEXT_PUBLIC_MAPTILER_KEY in environment variables."
        : `MapTiler unavailable (HTTP ${check.status || "error"}) — showing free map tiles.`,
  });
}
