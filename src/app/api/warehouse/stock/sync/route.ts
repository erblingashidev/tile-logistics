import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { isProDataSyncEnabled } from "@/lib/config/prodata-env";
import { testProDataConnection } from "@/lib/integrations/prodata-api";
import { prepareProDataImportFromApi } from "@/lib/integrations/prodata-stock";

export const runtime = "nodejs";
export const maxDuration = 26;

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** GET — test Pro-Data API connectivity (read-only, no DB writes). */
export async function GET() {
  try {
    await requireAdmin();
    if (!isProDataSyncEnabled()) {
      return NextResponse.json({
        ok: false,
        enabled: false,
        message:
          "Pro-Data API sync is disabled. Set PRODATA_SYNC_ENABLED=true in .env.local.",
      });
    }
    const result = await testProDataConnection();
    return NextResponse.json({ enabled: true, ...result });
  } catch (err) {
    const msg = errorMessage(err, "Pro-Data connection test failed.");
    const status = /unauthorized|forbidden|session/i.test(msg) ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

/**
 * POST — prepare stock sync payload from Pro-Data API.
 * Same response shape as Excel prepare; browser applies chunks via /import.
 */
export async function POST() {
  try {
    await requireAdmin();
    if (!isProDataSyncEnabled()) {
      return NextResponse.json(
        {
          error:
            "Pro-Data API sync is disabled. Set PRODATA_SYNC_ENABLED=true in .env.local.",
        },
        { status: 400 }
      );
    }

    const result = await prepareProDataImportFromApi();
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[warehouse/stock/sync]", err);
    return NextResponse.json(
      { error: errorMessage(err, "Pro-Data API sync prepare failed.") },
      { status: 500 }
    );
  }
}
