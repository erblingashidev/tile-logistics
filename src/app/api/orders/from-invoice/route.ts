import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/api-guard";
import { extractPdfText } from "@/lib/invoices/extract-pdf-text";
import { importInvoiceFromText } from "@/lib/invoices/process-invoice-import";

export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024;

function jsonFromResult(
  result: Awaited<ReturnType<typeof importInvoiceFromText>>,
  statusOk: number
) {
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        parsed: result.parsed,
        form: result.form,
        rawPreview: result.rawPreview,
      },
      { status: result.status }
    );
  }

  if (result.order) {
    return NextResponse.json(
      {
        order: result.order,
        parsed: result.parsed,
        form: result.form,
      },
      { status: 201 }
    );
  }

  return NextResponse.json(
    {
      parsed: result.parsed,
      form: result.form,
      payload: result.payload,
      duplicate: result.duplicate,
    },
    { status: statusOk }
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await request.json();
    const text = typeof body.text === "string" ? body.text : "";
    const preview = body.preview === true;
    const create = body.create === true;
    const invoiceNumberOverride =
      typeof body.invoiceNumberOverride === "string"
        ? body.invoiceNumberOverride
        : undefined;
    const result = await importInvoiceFromText(
      text,
      create ? "create" : "preview",
      { invoiceNumberOverride }
    );
    return jsonFromResult(result, 200);
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const invoiceText = formData.get("invoiceText");
  const preview = formData.get("preview") === "true";
  const create = formData.get("create") === "true";
  const invoiceNumberOverrideRaw = formData.get("invoiceNumberOverride");
  const invoiceNumberOverride =
    typeof invoiceNumberOverrideRaw === "string" &&
    invoiceNumberOverrideRaw.trim()
      ? invoiceNumberOverrideRaw
      : undefined;

  let text = "";

  if (typeof invoiceText === "string" && invoiceText.trim()) {
    text = invoiceText;
  } else if (file && file instanceof File) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File must be smaller than 12 MB" },
        { status: 400 }
      );
    }

    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      return NextResponse.json(
        {
          error:
            "For photos, use “Photo invoice” so the phone reads the page. PDF files can be uploaded directly.",
        },
        { status: 400 }
      );
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      text = await extractPdfText(buffer);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to read invoice PDF";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } else {
    return NextResponse.json(
      { error: "PDF file or invoice text is required" },
      { status: 400 }
    );
  }

  if (!text.trim()) {
    return NextResponse.json(
      {
        error:
          "No text found. Hold the phone steady and include the full invoice in the photo.",
      },
      { status: 422 }
    );
  }

  const result = await importInvoiceFromText(
    text,
    create ? "create" : "preview",
    { invoiceNumberOverride }
  );
  return jsonFromResult(result, 200);
}
