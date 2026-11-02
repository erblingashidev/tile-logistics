import { NextResponse } from "next/server";
import { runApiCompanyAdmin } from "@/lib/auth/api-guard";
import { clearOrganizationLogs } from "@/lib/services/logs-reset";

export const runtime = "nodejs";

export async function POST() {
  try {
    return await runApiCompanyAdmin(async ({ organizationId }) => {
      const result = await clearOrganizationLogs(organizationId);
      return NextResponse.json({ ok: true, ...result });
    });
  } catch {
    return NextResponse.json({ error: "Could not reset logs." }, { status: 500 });
  }
}
