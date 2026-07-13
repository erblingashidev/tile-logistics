"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, CollapsibleCard } from "@/components/ui";
import { normalizeOrderUnit } from "@/lib/constants";
import {
  createOrderFromInvoiceExcel,
  createOrderFromInvoicePdf,
  isInvoiceExcelFile,
  isInvoicePdfFile,
  previewInvoiceFromExcel,
  previewInvoiceFromPdf,
  type InvoiceImportPreviewResponse,
  type InvoiceImportPreviewItem,
} from "@/lib/invoices/import-client";
import { agimiDocumentKindLabel } from "@/lib/invoices/parse-agimi-invoice";
import { ocrScannedPdf } from "@/lib/invoices/ocr-pdf-client";
import type { OcrProgress } from "@/lib/invoices/ocr-image-client";
import { isScannedPdfErrorMessage } from "@/lib/invoices/scanned-pdf-error";

export type InvoiceImportFormState = {
  invoiceNumber: string;
  customerName: string;
  customerPhone: string;
  salesAgent: string;
  region: string;
  location: string;
  locationId?: string;
  city?: string;
  lat?: number;
  lng?: number;
  price: string;
  orderDate: string;
  requestedDeliveryDate: string;
  deliveryTimePreference: "flexible" | "morning" | "afternoon";
  importQueueId?: number;
  items: Array<{
    unit: import("@/lib/constants").OrderUnit | string;
    productEan?: string;
    productName?: string;
    tileWidthCm?: number;
    tileHeightCm?: number;
    quantityM2?: number;
    weightKg?: number;
    lengthM?: number;
    manualPieces?: number;
  }>;
};

interface InvoiceImportPanelProps {
  onOpenForm: (form: InvoiceImportFormState) => void;
  onCreated: () => void;
  onError: (message: string) => void;
  onWarning: (message: string) => void;
}

type ImportMode = "excel" | "pdf" | null;
type ImportStep = "pick" | "extract" | "review";

function invoiceNumberFromUploadName(fileName: string): string {
  const match = fileName
    .replace(/\.xlsx?$/i, "")
    .match(/\b(\d{2}-(?:SHV|SHF|PSV)\d{2}-\d{3}-\d{3,4})\b/i);
  return match ? match[1].toUpperCase() : "";
}

function ProgressBar({ percent }: { percent?: number }) {
  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-200">
      <div
        className={`h-full rounded-full bg-zinc-900 transition-all duration-300 ${
          percent == null ? "w-1/3 animate-pulse" : ""
        }`}
        style={percent != null ? { width: `${Math.max(8, percent)}%` } : undefined}
      />
    </div>
  );
}

function ImportOptionCard({
  title,
  description,
  icon,
  active,
  dragActive,
  children,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  title: string;
  description?: string;
  icon: string;
  active?: boolean;
  dragActive?: boolean;
  children: React.ReactNode;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`relative flex flex-col rounded-2xl border p-5 transition-all ${
        dragActive
          ? "border-zinc-900 bg-zinc-50 shadow-sm"
          : active
            ? "border-zinc-400 bg-white shadow-sm"
            : "border-zinc-200 bg-white hover:border-zinc-300"
      }`}
    >
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-lg">
          {icon}
        </span>
        <div>
          <p className="text-sm font-semibold text-zinc-900">{title}</p>
          {description ? (
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}

export function InvoiceImportPanel({
  onOpenForm,
  onCreated,
  onError,
  onWarning,
}: InvoiceImportPanelProps) {
  const excelInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const lastFileRef = useRef<File | null>(null);

  const [step, setStep] = useState<ImportStep>("pick");
  const [mode, setMode] = useState<ImportMode>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [busyPercent, setBusyPercent] = useState<number | undefined>();
  const [dragOver, setDragOver] = useState<ImportMode>(null);
  const [panelError, setPanelError] = useState("");
  const [panelHint, setPanelHint] = useState("");
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    size: number;
    kind: ImportMode;
    previewUrl?: string;
  } | null>(null);
  const [preview, setPreview] = useState<{
    parsed: InvoiceImportPreviewResponse["parsed"];
    form: InvoiceImportFormState;
    duplicate?: boolean;
    existingOrderId?: number;
  } | null>(null);
  const [detectedInvoices, setDetectedInvoices] = useState<
    InvoiceImportPreviewItem[]
  >([]);
  const [previewInvoiceNumber, setPreviewInvoiceNumber] = useState("");
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (busy || preview) {
      setExpanded(true);
    }
  }, [busy, preview]);

  function resetInputs() {
    if (excelInputRef.current) excelInputRef.current.value = "";
    if (pdfInputRef.current) pdfInputRef.current.value = "";
  }

  function resetImport() {
    setPreview(null);
    setDetectedInvoices([]);
    setPreviewInvoiceNumber("");
    setSelectedFile(null);
    setPanelError("");
    setPanelHint("");
    setStep("pick");
    setMode(null);
    lastFileRef.current = null;
    resetInputs();
    onError("");
  }

  function patchPreviewInvoiceNumber(
    data: {
      parsed: InvoiceImportPreviewResponse["parsed"];
      form: InvoiceImportFormState;
      duplicate?: boolean;
    },
    invoiceNumber: string
  ) {
    return {
      ...data,
      parsed: { ...data.parsed, invoiceNumber },
      form: { ...data.form, invoiceNumber },
    };
  }

  function showFailure(message: string, rawPreview?: string) {
    setPanelError(message);
    onError(message);
    if (rawPreview) {
      setPanelHint(`Detected text sample: ${rawPreview.slice(0, 180)}…`);
    } else {
      setPanelHint("");
    }
    setStep("pick");
  }

  function applyPreview(data: InvoiceImportPreviewResponse) {
    const invoices = data.invoices?.length
      ? data.invoices
      : [
          {
            parsed: data.parsed,
            form: data.form,
            duplicate: data.duplicate,
            existingOrderId: data.existingOrderId,
          },
        ];
    setDetectedInvoices(invoices);

    const active =
      invoices.find((entry) => entry.parsed.invoiceNumber === data.parsed.invoiceNumber) ??
      invoices[0];
    const form = active.form as InvoiceImportFormState;

    setPreview({
      parsed: active.parsed,
      form,
      duplicate: active.duplicate,
      existingOrderId: active.existingOrderId,
    });
    setPreviewInvoiceNumber(active.parsed.invoiceNumber ?? "");
    setStep("review");
    setPanelError("");
    setPanelHint("");
    onError("");
    if (active.parsed.warnings?.length) {
      onWarning(active.parsed.warnings.join(" "));
    }
    if (invoices.length > 1) {
      onWarning(`${invoices.length} documents detected — pick one by invoice number.`);
    }
  }

  function selectDetectedInvoice(invoiceNumber: string) {
    const entry = detectedInvoices.find(
      (item) => item.parsed.invoiceNumber === invoiceNumber
    );
    if (!entry) return;
    setPreview({
      parsed: entry.parsed,
      form: entry.form as InvoiceImportFormState,
      duplicate: entry.duplicate,
      existingOrderId: entry.existingOrderId,
    });
    setPreviewInvoiceNumber(entry.parsed.invoiceNumber ?? invoiceNumber);
    onError("");
    if (entry.parsed.warnings?.length) {
      onWarning(entry.parsed.warnings.join(" "));
    }
  }

  async function handleExcelFile(file: File | null) {
    if (busy) return;
    if (!file || !isInvoiceExcelFile(file)) {
      showFailure("Choose an Excel invoice file (.xlsx)");
      return;
    }

    setMode("excel");
    lastFileRef.current = file;
    setSelectedFile({
      name: file.name || "Invoice.xlsx",
      size: file.size,
      kind: "excel",
    });
    setPreview(null);
    setBusy(true);
    setBusyLabel("Reading Excel…");
    setBusyPercent(undefined);
    setPanelError("");
    setPanelHint("");
    setStep("extract");
    onError("");

    const result = await previewInvoiceFromExcel(file);
    if (result.ok) {
      const data = result.data;
      if (!data.parsed.invoiceNumber?.trim()) {
        const fromName = invoiceNumberFromUploadName(file.name || "");
        if (fromName) {
          data.parsed = { ...data.parsed, invoiceNumber: fromName };
          data.form = { ...data.form, invoiceNumber: fromName };
        }
      }
      applyPreview(data);
    } else {
      showFailure(result.error, result.rawPreview);
    }

    setBusy(false);
    setBusyLabel("");
    setBusyPercent(undefined);
  }

  async function handlePdfFile(file: File | null) {
    if (busy) return;
    if (!file || !isInvoicePdfFile(file)) {
      showFailure("Choose a PDF invoice file");
      return;
    }

    setMode("pdf");
    lastFileRef.current = file;
    setSelectedFile({
      name: file.name || "Invoice.pdf",
      size: file.size,
      kind: "pdf",
    });
    setPreview(null);
    setBusy(true);
    setBusyLabel("Reading PDF…");
    setBusyPercent(undefined);
    setPanelError("");
    setPanelHint("");
    setStep("extract");
    onError("");

    const result = await previewInvoiceFromPdf(file);
    if (result.ok) {
      applyPreview(result.data);
    } else if (isScannedPdfErrorMessage(result.error, result.code)) {
      setPanelHint("Scanned PDF detected — reading pages with OCR…");
      try {
        const text = await ocrScannedPdf(file, (progress: OcrProgress) => {
          setBusyLabel(progress.label);
          setBusyPercent(progress.percent);
        });
        const retry = await fetch("/api/orders/from-invoice", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, preview: true }),
        });
        const payload = await retry.json();
        if (!retry.ok) {
          showFailure((payload.error as string) ?? "Could not read the scanned PDF.");
        } else {
          applyPreview(payload as InvoiceImportPreviewResponse);
        }
      } catch (err) {
        showFailure(
          err instanceof Error
            ? err.message
            : "Could not read the scanned PDF."
        );
      }
    } else {
      showFailure(result.error, result.rawPreview);
    }

    setBusy(false);
    setBusyLabel("");
    setBusyPercent(undefined);
  }

  async function createNow(merge = false) {
    if (!preview) return;
    const invoiceNumber = previewInvoiceNumber.trim();
    if (!invoiceNumber) {
      showFailure("Enter the invoice number before creating the order");
      return;
    }

    setBusy(true);
    setBusyLabel(merge ? "Merging products…" : "Creating order…");
    setPanelError("");
    onError("");

    const importOptions = {
      selectedInvoiceNumber: invoiceNumber,
      invoiceNumberOverride: invoiceNumber,
      merge,
    };

    const result = lastFileRef.current
      ? isInvoiceExcelFile(lastFileRef.current)
        ? await createOrderFromInvoiceExcel(lastFileRef.current, importOptions)
        : isInvoicePdfFile(lastFileRef.current)
          ? await createOrderFromInvoicePdf(lastFileRef.current, importOptions)
          : null
      : null;

    if (!result) {
      showFailure("Import again — no invoice data in memory");
      setBusy(false);
      return;
    }

    if (!result.ok) {
      if (result.form && result.parsed) {
        setPreview(
          patchPreviewInvoiceNumber(
            {
              parsed: result.parsed,
              form: result.form as InvoiceImportFormState,
              duplicate: true,
            },
            invoiceNumber
          )
        );
      }
      showFailure(result.error);
      setBusy(false);
      return;
    }

    resetImport();
    onWarning(
      result.data.merged
        ? `Products merged into order ${result.data.order.invoiceNumber}`
        : `Order ${result.data.order.invoiceNumber} created from invoice`
    );
    onCreated();
    setBusy(false);
    setBusyLabel("");
  }

  function handleDrop(kind: ImportMode, file: File | null) {
    setDragOver(null);
    if (!file || !kind) return;
    if (kind === "excel") void handleExcelFile(file);
    else void handlePdfFile(file);
  }

  function importItemQuantityLabel(item: InvoiceImportFormState["items"][number]) {
    const unit = normalizeOrderUnit(item.unit);
    if (unit === "m2" && item.quantityM2 != null) {
      return `${item.quantityM2} m²`;
    }
    if (unit === "kg" && item.weightKg != null) {
      return `${item.weightKg} kg`;
    }
    if (unit === "meter" && item.lengthM != null) {
      return `${item.lengthM} m`;
    }
    if (item.manualPieces != null) {
      return `${item.manualPieces} copë`;
    }
    return "—";
  }

  return (
    <CollapsibleCard
      className="mb-4"
      title="Import AGIMI document"
      headerTone="muted"
      expanded={expanded}
      onExpandedChange={setExpanded}
    >
        {panelError && (
          <Alert tone="error">
            <p>{panelError}</p>
            {panelHint && (
              <p className="mt-2 text-xs opacity-80">{panelHint}</p>
            )}
          </Alert>
        )}

        <input
          ref={excelInputRef}
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="hidden"
          onChange={(e) => void handleExcelFile(e.target.files?.[0] ?? null)}
        />
        <input
          ref={pdfInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => void handlePdfFile(e.target.files?.[0] ?? null)}
        />

        {!preview && (
          <div className="grid gap-4 lg:grid-cols-2">
            <ImportOptionCard
              title="Excel"
              icon="📊"
              active={mode === "excel"}
              dragActive={dragOver === "excel"}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver("excel");
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0] ?? null;
                if (file && !isInvoiceExcelFile(file)) {
                  showFailure("Drop an Excel file (.xlsx) in this area");
                  return;
                }
                handleDrop("excel", file);
              }}
            >
              <Button
                className="mt-auto self-start"
                disabled={busy}
                onClick={() => excelInputRef.current?.click()}
              >
                Choose Excel
              </Button>
            </ImportOptionCard>

            <ImportOptionCard
              title="PDF"
              icon="📄"
              active={mode === "pdf"}
              dragActive={dragOver === "pdf"}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver("pdf");
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0] ?? null;
                if (file && !isInvoicePdfFile(file)) {
                  showFailure("Drop a PDF file in this area");
                  return;
                }
                handleDrop("pdf", file);
              }}
            >
              <Button
                className="mt-auto self-start"
                variant="secondary"
                disabled={busy}
                onClick={() => pdfInputRef.current?.click()}
              >
                Choose PDF
              </Button>
            </ImportOptionCard>
          </div>
        )}

        {busy && (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
            <p className="text-sm font-medium text-zinc-800">
              {busyLabel || "Processing…"}
              {busyPercent != null ? ` · ${busyPercent}%` : ""}
            </p>
            <ProgressBar percent={busyPercent} />
          </div>
        )}

        {selectedFile && step !== "review" && (
          <p className="text-xs text-zinc-500">{selectedFile.name}</p>
        )}

        {preview && (
          <div className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4">
            {detectedInvoices.length > 1 && (
              <div>
                <p className="mb-2 text-xs font-medium text-zinc-500">
                  {detectedInvoices.length} documents — select invoice number
                </p>
                <div className="flex flex-wrap gap-2">
                  {detectedInvoices.map((entry) => {
                    const number = entry.parsed.invoiceNumber || "Unknown";
                    const active = number === previewInvoiceNumber;
                    return (
                      <button
                        key={number}
                        type="button"
                        onClick={() => selectDetectedInvoice(number)}
                        className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                          active
                            ? "border-zinc-900 bg-white shadow-sm"
                            : "border-zinc-200 bg-white hover:border-zinc-400"
                        }`}
                      >
                        <span className="block font-mono font-medium text-zinc-900">
                          {number}
                        </span>
                        <span className="mt-0.5 block text-zinc-600">
                          {entry.parsed.customerName || "—"}
                          {entry.duplicate ? " · exists" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {preview.duplicate && (
              <Alert tone="warning">
                Invoice {previewInvoiceNumber || preview.parsed.invoiceNumber}{" "}
                already exists
                {preview.existingOrderId
                  ? ` (order #${preview.existingOrderId})`
                  : ""}
                . Merge to add products, or change the number.
              </Alert>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Invoice number
              </label>
              <input
                value={previewInvoiceNumber}
                onChange={(e) => {
                  const value = e.target.value;
                  setPreviewInvoiceNumber(value);
                  setPreview((current) =>
                    current
                      ? patchPreviewInvoiceNumber(current, value)
                      : current
                  );
                }}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900"
                placeholder="26-SHV01-001-6263"
                spellCheck={false}
              />
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <PreviewField
                label="Document"
                value={agimiDocumentKindLabel(preview.parsed.documentKind)}
              />
              <PreviewField
                label="Referenti Juaj"
                value={preview.parsed.salesAgent || "—"}
                highlight={!preview.parsed.salesAgent}
              />
              <PreviewField label="Date" value={preview.parsed.orderDate} />
              <PreviewField
                label="Total"
                value={
                  preview.parsed.documentKind === "delivery_note" &&
                  preview.parsed.price <= 0
                    ? "— (no payment on delivery note)"
                    : `${preview.parsed.price.toFixed(2)} EUR`
                }
              />
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-zinc-500">
                  {preview.parsed.documentKind === "delivery_note"
                    ? "Buyer (Fatura dërgohet në)"
                    : "Customer"}
                </dt>
                <dd className="font-semibold text-zinc-900">
                  {preview.parsed.customerName || "—"}
                </dd>
                {preview.parsed.customerPhone && (
                  <dd className="mt-0.5 text-zinc-700">
                    Tel: {preview.parsed.customerPhone}
                  </dd>
                )}
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-zinc-500">Delivery</dt>
                <dd className="text-zinc-800">
                  {preview.parsed.address || "—"}
                  {preview.parsed.city ? ` · ${preview.parsed.city}` : ""}
                  {preview.parsed.region ? ` (${preview.parsed.region})` : ""}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <p className="mb-2 text-xs font-medium text-zinc-500">
                  Products ({preview.parsed.items.length})
                </p>
                <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                        <th className="px-3 py-2">Kodi</th>
                        <th className="px-3 py-2">Emërtimi</th>
                        <th className="px-3 py-2 text-right">Sasia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.form.items.map((item, idx) => (
                        <tr key={idx} className="border-b border-zinc-100 last:border-0">
                          <td className="px-3 py-2 font-mono text-xs text-zinc-600">
                            {item.productEan || "—"}
                          </td>
                          <td className="px-3 py-2 text-zinc-800">
                            {item.productName?.trim() || "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-zinc-900">
                            {importItemQuantityLabel(item)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </dl>

            {preview.parsed.warnings.length > 0 && (
              <ul className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {preview.parsed.warnings.map((w) => (
                  <li key={w}>• {w}</li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap gap-2 border-t border-zinc-200 pt-3">
              {preview.duplicate ? (
                <Button
                  disabled={busy || !previewInvoiceNumber.trim()}
                  onClick={() => void createNow(true)}
                >
                  {busy ? busyLabel || "Working…" : "Merge products"}
                </Button>
              ) : (
                <Button
                  disabled={busy || !previewInvoiceNumber.trim()}
                  onClick={() => void createNow(false)}
                >
                  {busy ? busyLabel || "Working…" : "Create order"}
                </Button>
              )}
              {!preview.duplicate && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    onOpenForm(
                      patchPreviewInvoiceNumber(preview, previewInvoiceNumber).form
                    );
                    setPreview(null);
                    setStep("pick");
                  }}
                >
                  Review in form
                </Button>
              )}
              <Button variant="ghost" disabled={busy} onClick={resetImport}>
                Start over
              </Button>
            </div>
          </div>
        )}
    </CollapsibleCard>
  );
}

function PreviewField({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-zinc-500">{label}</dt>
      <dd className={highlight ? "font-medium text-amber-700" : "text-zinc-900"}>
        {value}
        {highlight ? " — check invoice or enter manually" : ""}
      </dd>
    </div>
  );
}
