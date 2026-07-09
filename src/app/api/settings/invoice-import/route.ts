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

  try {
    const settings = await getInvoiceImportSettings();
    return NextResponse.json(settings);
  } catch (err) {
    console.error("invoice-import settings GET", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not load invoice settings",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  let body: { watchRoot?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const watchRoot =
    typeof body.watchRoot === "string" ? body.watchRoot.trim() : "";

  if (!watchRoot) {
    return NextResponse.json(
      { error: "Enter the main folder path (e.g. C:\\Faturat-Logistics)" },
      { status: 400 }
    );
  }

  if (watchRoot.length > 500) {
    return NextResponse.json(
      { error: "Folder path is too long (max 500 characters)" },
      { status: 400 }
    );
  }

  try {
    await setInvoiceWatchRoot(watchRoot);
    const settings = await getInvoiceImportSettings();
    return NextResponse.json(settings);
  } catch (err) {
    console.error("invoice-import settings PATCH", err);
    const message =
      err instanceof Error ? err.message : "Could not save folder path";
    if (/no such table/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "Database not updated yet — redeploy the app, then try again.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
