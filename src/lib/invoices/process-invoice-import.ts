import {
  detectAgimiDocumentKind,
  parseAgimiInvoice,
  parsedInvoiceToFormState,
  parsedInvoiceToOrderPayload,
  splitTextByAgimiInvoiceNumbers,
  type ParsedAgimiInvoice,
} from "@/lib/invoices/parse-agimi-invoice";
import { resolveSalesOwnership } from "@/lib/services/sales-portal";
import {
  appendOrderItems,
  createOrder,
  findOrderByInvoiceNumber,
  type OrderPayload,
} from "@/lib/services/orders";
import { normalizeScannedInvoiceNumber } from "@/lib/invoices/scan-utils";

export type InvoiceImportEntry = {
  parsed: ParsedAgimiInvoice;
  form: ReturnType<typeof parsedInvoiceToFormState>;
  payload: OrderPayload;
  duplicate: boolean;
  existingOrderId?: number;
};

export type InvoiceImportResult =
  | {
      ok: true;
      parsed: ParsedAgimiInvoice;
      form: ReturnType<typeof parsedInvoiceToFormState>;
      payload: OrderPayload;
      duplicate: boolean;
      existingOrderId?: number;
      multiple?: boolean;
      invoices?: InvoiceImportEntry[];
      merged?: boolean;
      order?: Awaited<ReturnType<typeof createOrder>>;
    }
  | {
      ok: false;
      status: number;
      error: string;
      parsed?: ParsedAgimiInvoice;
      form?: ReturnType<typeof parsedInvoiceToFormState>;
      rawPreview?: string;
    };

export type InvoiceImportOptions = {
  invoiceNumberOverride?: string;
  /** When a PDF contains several documents, import this invoice number only. */
  selectedInvoiceNumber?: string;
  /** Append line items to an existing order with the same invoice number. */
  mergeIntoExisting?: boolean;
};

function invoiceNumbersMatch(a: string, b: string): boolean {
  return (
    normalizeScannedInvoiceNumber(a) === normalizeScannedInvoiceNumber(b)
  );
}

function isRecognized(parsed: ParsedAgimiInvoice, segmentText: string): boolean {
  const documentKind = detectAgimiDocumentKind(segmentText);
  return Boolean(
    parsed.invoiceNumber ||
      parsed.customerName ||
      parsed.price > 0 ||
      parsed.items.some((i) => (i.quantityM2 ?? 0) > 0 || (i.weightKg ?? 0) > 0) ||
      documentKind === "delivery_note"
  );
}

function applyInvoiceOverride(
  parsed: ParsedAgimiInvoice,
  override?: string
): void {
  if (!override?.trim()) return;
  parsed.invoiceNumber = normalizeScannedInvoiceNumber(override);
}

async function buildImportEntry(
  parsed: ParsedAgimiInvoice
): Promise<InvoiceImportEntry> {
  const existing = parsed.invoiceNumber
    ? await findOrderByInvoiceNumber(parsed.invoiceNumber)
    : null;

  return {
    parsed,
    form: parsedInvoiceToFormState(parsed),
    payload: parsedInvoiceToOrderPayload(parsed),
    duplicate: Boolean(existing),
    existingOrderId: existing?.id,
  };
}

async function createOrMergeEntry(
  entry: InvoiceImportEntry,
  options?: InvoiceImportOptions
): Promise<InvoiceImportResult> {
  const { parsed, form, payload } = entry;

  if (entry.duplicate && entry.existingOrderId) {
    if (options?.mergeIntoExisting) {
      if (payload.items.length === 0) {
        return {
          ok: false,
          status: 422,
          error: "No products to merge.",
          parsed,
          form,
        };
      }

      const order = await appendOrderItems(entry.existingOrderId, payload.items, {
        addPrice: payload.price,
        notesAppend: payload.notes,
      });

      return {
        ok: true,
        parsed,
        form,
        payload,
        duplicate: true,
        existingOrderId: entry.existingOrderId,
        merged: true,
        order,
      };
    }

    return {
      ok: false,
      status: 409,
      error: `Invoice ${parsed.invoiceNumber} already exists (order #${entry.existingOrderId}) — use merge to add products.`,
      parsed,
      form,
    };
  }

  if (!payload.invoiceNumber || !payload.customerName) {
    return {
      ok: false,
      status: 422,
      error:
        "Missing invoice number or customer.",
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

  const ownership = await resolveSalesOwnership({
    salesAgentName: payload.salesAgentName,
    salesEmployeeId: payload.salesEmployeeId,
  });
  payload.salesEmployeeId = ownership.salesEmployeeId;
  payload.salesAgentName = ownership.salesAgentName;

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

export async function importInvoicesFromText(
  text: string,
  mode: "preview" | "create",
  options?: InvoiceImportOptions
): Promise<InvoiceImportEntry[]> {
  const trimmed = text.trim();
  const segments = splitTextByAgimiInvoiceNumbers(trimmed);
  let selectedSegments = segments;

  if (options?.selectedInvoiceNumber?.trim()) {
    const target = normalizeScannedInvoiceNumber(options.selectedInvoiceNumber);
    selectedSegments = segments.filter((segment) =>
      invoiceNumbersMatch(segment.invoiceNumber, target)
    );
  }

  const entries: InvoiceImportEntry[] = [];
  for (const segment of selectedSegments) {
    const parsed = parseAgimiInvoice(segment.text);
    if (segment.invoiceNumber) {
      parsed.invoiceNumber = segment.invoiceNumber;
    }
    if (
      options?.invoiceNumberOverride?.trim() &&
      selectedSegments.length === 1
    ) {
      applyInvoiceOverride(parsed, options.invoiceNumberOverride);
    }
    if (!isRecognized(parsed, segment.text)) continue;
    entries.push(await buildImportEntry(parsed));
  }

  if (entries.length === 0 && mode === "preview") {
    const fallback = parseAgimiInvoice(trimmed);
    applyInvoiceOverride(fallback, options?.invoiceNumberOverride);
    if (isRecognized(fallback, trimmed)) {
      entries.push(await buildImportEntry(fallback));
    }
  }

  return entries;
}

export async function importInvoiceFromText(
  text: string,
  mode: "preview" | "create",
  options?: InvoiceImportOptions
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

  const allEntries = await importInvoicesFromText(trimmed, mode, options);

  if (allEntries.length === 0) {
    return {
      ok: false,
      status: 422,
      error:
        mode === "preview"
          ? "Could not recognize this AGIMI invoice. Try a clearer photo, a PDF export, or fill the form manually."
          : "Could not recognize an AGIMI invoice. Use a clear photo or PDF of the full invoice page.",
      rawPreview: trimmed.slice(0, 800),
    };
  }

  const multiple = splitTextByAgimiInvoiceNumbers(trimmed).length > 1;

  const active =
    allEntries.find((entry) =>
      options?.selectedInvoiceNumber
        ? invoiceNumbersMatch(
            entry.parsed.invoiceNumber,
            options.selectedInvoiceNumber
          )
        : false
    ) ?? allEntries[0];

  if (mode === "create") {
    const result = await createOrMergeEntry(active, options);
    if (!result.ok) return result;
    return {
      ...result,
      multiple,
      invoices: allEntries,
    };
  }

  return {
    ok: true,
    parsed: active.parsed,
    form: active.form,
    payload: active.payload,
    duplicate: active.duplicate,
    existingOrderId: active.existingOrderId,
    multiple,
    invoices: allEntries,
  };
}
