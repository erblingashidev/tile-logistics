"use client";

import type { InvoiceImportEntry } from "@/lib/invoices/process-invoice-import";

export type InvoiceImportPreviewItem = {
  parsed: InvoiceImportEntry["parsed"];
  form: Record<string, unknown>;
  duplicate?: boolean;
  existingOrderId?: number;
};

export type InvoiceImportPreviewResponse = {
  parsed: InvoiceImportPreviewItem["parsed"];
  form: Record<string, unknown>;
  duplicate?: boolean;
  existingOrderId?: number;
  multiple?: boolean;
  invoices?: InvoiceImportPreviewItem[];
  payload?: unknown;
};

export type InvoiceImportCreateResponse = {
  order: { invoiceNumber: string; id?: number };
  parsed: InvoiceImportPreviewResponse["parsed"];
  form: Record<string, unknown>;
  merged?: boolean;
  multiple?: boolean;
  invoices?: InvoiceImportPreviewItem[];
};

type ImportFailure = {
  ok: false;
  status: number;
  error: string;
  code?: string;
  parsed?: InvoiceImportPreviewResponse["parsed"];
  form?: Record<string, unknown>;
  rawPreview?: string;
};

type ImportSuccess<T> = { ok: true; data: T };

type ImportRequestOptions = {
  invoiceNumberOverride?: string;
  selectedInvoiceNumber?: string;
  merge?: boolean;
};

async function readImportResponse<T>(
  res: Response
): Promise<ImportSuccess<T> | ImportFailure> {
  const contentType = res.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    if (res.status === 401) {
      return {
        ok: false,
        status: 401,
        error: "Session expired — refresh the page and log in again.",
      };
    }
    return {
      ok: false,
      status: res.status,
      error: `Server error (${res.status}). Try again in a moment.`,
    };
  }

  const data = (await res.json()) as Record<string, unknown>;

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: (data.error as string) ?? "Import failed",
      code: data.code as string | undefined,
      parsed: data.parsed as InvoiceImportPreviewResponse["parsed"],
      form: data.form as Record<string, unknown>,
      rawPreview: data.rawPreview as string | undefined,
    };
  }

  return { ok: true, data: data as T };
}

export async function previewInvoiceFromText(
  text: string,
  options?: ImportRequestOptions
) {
  const res = await fetch("/api/orders/from-invoice", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      preview: true,
      invoiceNumberOverride: options?.invoiceNumberOverride?.trim() || undefined,
      selectedInvoiceNumber: options?.selectedInvoiceNumber?.trim() || undefined,
    }),
  });
  return readImportResponse<InvoiceImportPreviewResponse>(res);
}

export async function previewInvoiceFromPdf(file: File) {
  const body = new FormData();
  body.append("file", file);
  body.append("preview", "true");
  const res = await fetch("/api/orders/from-invoice", {
    method: "POST",
    credentials: "same-origin",
    body,
  });
  return readImportResponse<InvoiceImportPreviewResponse>(res);
}

export function isInvoiceExcelFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return (
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "application/vnd.ms-excel"
  );
}

export function isInvoicePdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

export async function previewInvoiceFromExcel(file: File) {
  const body = new FormData();
  body.append("file", file);
  body.append("preview", "true");
  const res = await fetch("/api/orders/from-invoice", {
    method: "POST",
    credentials: "same-origin",
    body,
  });
  return readImportResponse<InvoiceImportPreviewResponse>(res);
}

export async function createOrderFromInvoiceExcel(
  file: File,
  options: ImportRequestOptions
) {
  const body = new FormData();
  body.append("file", file);
  body.append("create", "true");
  if (options.invoiceNumberOverride?.trim()) {
    body.append("invoiceNumberOverride", options.invoiceNumberOverride.trim());
  }
  if (options.selectedInvoiceNumber?.trim()) {
    body.append("selectedInvoiceNumber", options.selectedInvoiceNumber.trim());
  }
  if (options.merge) {
    body.append("merge", "true");
  }
  const res = await fetch("/api/orders/from-invoice", {
    method: "POST",
    credentials: "same-origin",
    body,
  });
  return readImportResponse<InvoiceImportCreateResponse>(res);
}

export async function createOrderFromInvoiceText(
  text: string,
  options: ImportRequestOptions
) {
  const res = await fetch("/api/orders/from-invoice", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      create: true,
      invoiceNumberOverride: options.invoiceNumberOverride?.trim() || undefined,
      selectedInvoiceNumber: options.selectedInvoiceNumber?.trim() || undefined,
      merge: options.merge === true,
    }),
  });
  return readImportResponse<InvoiceImportCreateResponse>(res);
}

export async function createOrderFromInvoicePdf(
  file: File,
  options: ImportRequestOptions
) {
  const body = new FormData();
  body.append("file", file);
  body.append("create", "true");
  if (options.invoiceNumberOverride?.trim()) {
    body.append("invoiceNumberOverride", options.invoiceNumberOverride.trim());
  }
  if (options.selectedInvoiceNumber?.trim()) {
    body.append("selectedInvoiceNumber", options.selectedInvoiceNumber.trim());
  }
  if (options.merge) {
    body.append("merge", "true");
  }
  const res = await fetch("/api/orders/from-invoice", {
    method: "POST",
    credentials: "same-origin",
    body,
  });
  return readImportResponse<InvoiceImportCreateResponse>(res);
}
