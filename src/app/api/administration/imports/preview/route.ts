import { NextRequest, NextResponse } from "next/server";
import { requireAdministrationWrite } from "@/lib/auth/administration-api";
import { previewFinanceSpreadsheet } from "@/lib/administration/finance-import-preview";

export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const auth = await requireAdministrationWrite();
  if (!auth.ok) return auth.response;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Upload a file." }, { status: 400 });
  }
  const name = file.name || "upload.xlsx";
  const lower = name.toLowerCase();
  if (
    !lower.endsWith(".xlsx") &&
    !lower.endsWith(".xls") &&
    !lower.endsWith(".csv")
  ) {
    return NextResponse.json(
      { error: "Use .xlsx, .xls, or .csv from your finance system." },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File is too large (max 12 MB)." },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const preview = previewFinanceSpreadsheet(buffer, name);
    return NextResponse.json({
      preview,
      message:
        "Preview only — column mapping and import into sales, expenses, and debts will be enabled once we align with your official export format.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read file";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
