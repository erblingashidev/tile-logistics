import { NextRequest, NextResponse } from "next/server";
import { requireApiSessionNoSalesWrite } from "@/lib/auth/api-guard";
import { extractPdfText } from "@/lib/invoices/extract-pdf-text";
import {
  importInvoiceFromExcel,
  importInvoiceFromText,
} from "@/lib/invoices/process-invoice-import";
import {
  SCANNED_PDF_CODE,
  ScannedPdfError,
} from "@/lib/invoices/scanned-pdf-error";

export const runtime = "nodejs";

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
        merged: result.merged ?? false,
        multiple: result.multiple ?? false,
        invoices: result.invoices,
      },
      { status: result.merged ? 200 : 201 }
    );
  }

  return NextResponse.json(
    {
      parsed: result.parsed,
      form: result.form,
      payload: result.payload,
      duplicate: result.duplicate,
      existingOrderId: result.existingOrderId,
      multiple: result.multiple ?? false,
      invoices: result.invoices,
    },
    { status: statusOk }
  );
}

function readImportOptions(body: Record<string, unknown>) {
  const invoiceNumberOverride =
    typeof body.invoiceNumberOverride === "string"
      ? body.invoiceNumberOverride
      : undefined;
  const selectedInvoiceNumber =
    typeof body.selectedInvoiceNumber === "string"
      ? body.selectedInvoiceNumber
      : undefined;
  const mergeIntoExisting = body.merge === true || body.mergeIntoExisting === true;
  return { invoiceNumberOverride, selectedInvoiceNumber, mergeIntoExisting };
}

export async function POST(request: NextRequest) {
  const auth = await requireApiSessionNoSalesWrite(request.method);
  if (!auth.ok) return auth.response;

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await request.json();
    const text = typeof body.text === "string" ? body.text : "";
    const preview = body.preview === true;
    const create = body.create === true;
    const result = await importInvoiceFromText(
      text,
      create ? "create" : "preview",
      readImportOptions(body as Record<string, unknown>)
    );
    return jsonFromResult(result, 200);
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const invoiceText = formData.get("invoiceText");
  const preview = formData.get("preview") === "true";
  const create = formData.get("create") === "true";
  const invoiceNumberOverrideRaw = formData.get("invoiceNumberOverride");
  const selectedInvoiceNumberRaw = formData.get("selectedInvoiceNumber");
  const mergeRaw = formData.get("merge");

  const invoiceNumberOverride =
    typeof invoiceNumberOverrideRaw === "string" &&
    invoiceNumberOverrideRaw.trim()
      ? invoiceNumberOverrideRaw
      : undefined;
  const selectedInvoiceNumber =
    typeof selectedInvoiceNumberRaw === "string" &&
    selectedInvoiceNumberRaw.trim()
      ? selectedInvoiceNumberRaw
      : invoiceNumberOverride;

  let text = "";

  if (typeof invoiceText === "string" && invoiceText.trim()) {
    text = invoiceText;
  } else if (file && file instanceof File) {
    const lowerName = file.name.toLowerCase();
    const isPdf =
      file.type === "application/pdf" || lowerName.endsWith(".pdf");
    const isExcel =
      file.type ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.type === "application/vnd.ms-excel" ||
      lowerName.endsWith(".xlsx") ||
      lowerName.endsWith(".xls");

    if (isExcel) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await importInvoiceFromExcel(
        buffer,
        create ? "create" : "preview",
        {
          invoiceNumberOverride,
          selectedInvoiceNumber,
          mergeIntoExisting: mergeRaw === "true",
        }
      );
      return jsonFromResult(result, 200);
    }

    if (!isPdf) {
      return NextResponse.json(
        {
          error: "Upload an Excel (.xlsx) or PDF invoice file.",
        },
        { status: 400 }
      );
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      text = await extractPdfText(buffer);
    } catch (err) {
      if (err instanceof ScannedPdfError) {
        return NextResponse.json(
          { error: err.message, code: SCANNED_PDF_CODE },
          { status: 422 }
        );
      }
      const message =
        err instanceof Error ? err.message : "Failed to read invoice PDF";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } else {
    return NextResponse.json(
      { error: "Excel or PDF file is required" },
      { status: 400 }
    );
  }

  if (!text.trim()) {
    return NextResponse.json(
      {
        error:
          "No text found in PDF. Try exporting from Pro-Data as Excel, or use a text-based PDF.",
      },
      { status: 422 }
    );
  }

  const result = await importInvoiceFromText(
    text,
    create ? "create" : "preview",
    {
      invoiceNumberOverride,
      selectedInvoiceNumber,
      mergeIntoExisting: mergeRaw === "true",
    }
  );
  return jsonFromResult(result, 200);
}
