import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbOne } from "@/lib/db/query";
import { orders } from "@/lib/db/schema";
import { extractPdfText } from "@/lib/invoices/extract-pdf-text";
import {
  parseAgimiInvoice,
  parsedInvoiceToFormState,
  parsedInvoiceToOrderPayload,
} from "@/lib/invoices/parse-agimi-invoice";
import { createOrder } from "@/lib/services/orders";

export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");
  const preview = formData.get("preview") === "true";
  const create = formData.get("create") === "true";

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "PDF file is required" }, { status: 400 });
  }

  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json(
      { error: "Only PDF invoice files are supported" },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "PDF must be smaller than 12 MB" },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await extractPdfText(buffer);

    if (!text.trim()) {
      return NextResponse.json(
        {
          error:
            "No text found in PDF. Scanned invoices need a readable scan — try re-scanning with higher contrast.",
        },
        { status: 422 }
      );
    }

    const parsed = parseAgimiInvoice(text);

    if (!parsed.invoiceNumber && !parsed.customerName) {
      return NextResponse.json(
        {
          error:
            "Could not recognize an AGIMI invoice in this PDF. Use a clear scan of the full invoice page.",
          rawPreview: text.slice(0, 500),
        },
        { status: 422 }
      );
    }

    const db = await getDb();
    if (parsed.invoiceNumber) {
      const existing = await dbOne(
        db
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.invoiceNumber, parsed.invoiceNumber))
      );
      if (existing && create) {
        return NextResponse.json(
          {
            error: `Invoice ${parsed.invoiceNumber} already exists (order #${existing.id})`,
            parsed,
            form: parsedInvoiceToFormState(parsed),
          },
          { status: 409 }
        );
      }
    }

    const form = parsedInvoiceToFormState(parsed);
    const payload = parsedInvoiceToOrderPayload(parsed);

    if (preview || !create) {
      return NextResponse.json({
        parsed,
        form,
        payload,
        duplicate: parsed.invoiceNumber
          ? !!(await dbOne(
              db
                .select({ id: orders.id })
                .from(orders)
                .where(eq(orders.invoiceNumber, parsed.invoiceNumber))
            ))
          : false,
      });
    }

    if (!payload.invoiceNumber || !payload.customerName) {
      return NextResponse.json(
        {
          error: "Missing invoice number or customer — review the preview and edit before saving.",
          parsed,
          form,
        },
        { status: 422 }
      );
    }

    if (!payload.region && !payload.location?.trim()) {
      return NextResponse.json(
        {
          error: "Missing delivery region — set location on the form after import.",
          parsed,
          form,
        },
        { status: 422 }
      );
    }

    const order = await createOrder(payload);
    return NextResponse.json({ order, parsed, form }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read invoice PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
