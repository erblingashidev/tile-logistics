import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth";
import { listOrganizations } from "@/lib/services/organizations";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requirePlatformAdmin();
    const organizations = await listOrganizations();
    return NextResponse.json({ organizations });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
