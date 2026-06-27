import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dbOne } from "@/lib/db/query";
import { orders } from "@/lib/db/schema";
import {
  parseAgimiInvoice,
  parsedInvoiceToFormState,
  parsedInvoiceToOrderPayload,
  type ParsedAgimiInvoice,
} from "@/lib/invoices/parse-agimi-invoice";
import { createOrder, type OrderPayload } from "@/lib/services/orders";
import { normalizeScannedInvoiceNumber } from "@/lib/invoices/scan-utils";

export type InvoiceImportResult =
  | {
      ok: true;
      parsed: ParsedAgimiInvoice;
      form: ReturnType<typeof parsedInvoiceToFormState>;
      payload: OrderPayload;
      duplicate: boolean;
      order?: Awaited<ReturnType<typeof createOrder>>;
    }
  | { ok: false; status: number; error: string; parsed?: ParsedAgimiInvoice; form?: ReturnType<typeof parsedInvoiceToFormState>; rawPreview?: string };

export async function importInvoiceFromText(
  text: string,
  mode: "preview" | "create",
  options?: { invoiceNumberOverride?: string }
): Promise<InvoiceImportResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      ok: false,
      status: 422,
      error:
        "No text found. For photos, hold the phone steady and include the full invoice page.",
    };
  }

  const parsed = parseAgimiInvoice(trimmed);

  if (options?.invoiceNumberOverride?.trim()) {
    parsed.invoiceNumber = normalizeScannedInvoiceNumber(
      options.invoiceNumberOverride
    );
  }

  if (!parsed.invoiceNumber && !parsed.customerName) {
    return {
      ok: false,
      status: 422,
      error:
        "Could not recognize an AGIMI invoice. Use a clear photo or PDF of the full invoice page.",
      rawPreview: trimmed.slice(0, 500),
    };
  }

  const db = await getDb();
  const existing = parsed.invoiceNumber
    ? await dbOne(
        db
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.invoiceNumber, parsed.invoiceNumber))
      )
    : null;

  const form = parsedInvoiceToFormState(parsed);
  const payload = parsedInvoiceToOrderPayload(parsed);
  const duplicate = Boolean(existing);

  if (mode === "create") {
    if (existing) {
      return {
        ok: false,
        status: 409,
        error: `Invoice ${parsed.invoiceNumber} already exists (order #${existing.id})`,
        parsed,
        form,
      };
    }

    if (!payload.invoiceNumber || !payload.customerName) {
      return {
        ok: false,
        status: 422,
        error:
          "Missing invoice number or customer — review the preview and edit before saving.",
        parsed,
        form,
      };
    }

    if (!payload.region && !payload.location?.trim()) {
      return {
        ok: false,
        status: 422,
        error:
          "Missing delivery region — set location on the form after import.",
        parsed,
        form,
      };
    }

    const order = await createOrder(payload);
    return {
      ok: true,
      parsed,
      form,
      payload,
      duplicate: false,
      order,
    };
  }

  return {
    ok: true,
    parsed,
    form,
    payload,
    duplicate,
  };
}