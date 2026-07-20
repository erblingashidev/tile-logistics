import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { importProDataStockExcel } from "@/lib/integrations/prodata-stock";

export const runtime = "nodejs";
/** Netlify / OpenNext — large Pro-Data exports need more than the default 10s. */
export const maxDuration = 60;

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Upload a Pro-Data Excel (.xlsx) file as multipart form field \"file\"." },
        { status: 400 }
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Upload a Pro-Data Excel (.xlsx) file." },
        { status: 400 }
      );
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Excel file is too large (max 15 MB)." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importProDataStockExcel(buffer);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[warehouse/stock/import]", err);
    return NextResponse.json(
      {
        error: errorMessage(
          err,
          "Pro-Data import failed. Try again, or run npm run turso:apply-schema if the database is missing columns."
        ),
      },
      { status: 500 }
    );
  }
}
