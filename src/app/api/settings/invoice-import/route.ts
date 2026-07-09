import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin, requireApiSessionNoSalesWrite } from "@/lib/auth/api-guard";
import {
  getInvoiceImportSettings,
  setInvoiceWatchRoot,
} from "@/lib/services/app-settings";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApiSessionNoSalesWrite("GET");
  if (!auth.ok) return auth.response;

  const settings = await getInvoiceImportSettings();
  return NextResponse.json(settings);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const watchRoot =
    typeof body.watchRoot === "string" ? body.watchRoot.trim() : "";

  if (!watchRoot) {
    return NextResponse.json(
      { error: "Enter the main folder path (e.g. C:\\Faturat-Logistics)" },
      { status: 400 }
    );
  }

  await setInvoiceWatchRoot(watchRoot);
  const settings = await getInvoiceImportSettings();
  return NextResponse.json(settings);
}
