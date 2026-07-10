import { NextResponse } from "next/server";
import { requireApiSessionNoSalesWrite } from "@/lib/auth/api-guard";
import { getMapConfig } from "@/lib/locations/map-config";

export const runtime = "nodejs";

/** Runtime map tile config — reads Netlify env on each request (no rebuild needed for new keys). */
export async function GET() {
  const auth = await requireApiSessionNoSalesWrite("GET");
  if (!auth.ok) return auth.response;

  return NextResponse.json(getMapConfig(), {
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
