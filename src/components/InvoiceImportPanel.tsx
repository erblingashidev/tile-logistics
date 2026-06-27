"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Card } from "@/components/ui";
import { formatM2 } from "@/lib/calculations";
import {
  createPhotoPreviewUrl,
  formatImportFileSize,
  isInvoiceImageFile,
  isInvoicePdfFile,
  ocrInvoiceImage,
  type OcrProgress,
} from "@/lib/invoices/ocr-image-client";

type FormState = {
  invoiceNumber: string;
  customerName: string;
  customerPhone: string;
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
  items: Array<{
    productType: "tile" | "adhesive";
    productName?: string;
    tileWidthCm?: number;
    tileHeightCm?: number;
    quantityM2?: number;
  }>;
};

interface ParsedPreview {
  invoiceNumber: string;
  customerName: string;
  customerPhone?: string;
  address: string;
  city: string;
  region: string;
  orderDate: string;
  price: number;
  items: Array<{
    productName?: string;
    tileWidthCm?: number;
    tileHeightCm?: number;
    quantityM2?: number;
  }>;
  warnings: string[];
}

interface InvoiceImportPanelProps {
  onOpenForm: (form: FormState) => void;
  onCreated: () => void;
  onError: (message: string) => void;
  onWarning: (message: string) => void;
}

function ProgressBar({ percent }: { percent?: number }) {
  if (percent == null) {
    return (
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-zinc-500" />
      </div>
    );
  }
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200">
      <div
        className="h-full rounded-full bg-zinc-800 transition-all duration-300"
        style={{ width: `${Math.max(8, percent)}%` }}
      />
    </div>
  );
}

export function InvoiceImportPanel({
  onOpenForm,
  onCreated,
  onError,
  onWarning,
}: InvoiceImportPanelProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const lastFileRef = useRef<File | null>(null);
  const lastTextRef = useRef<string>("");
  const photoPreviewUrlRef = useRef<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [busyPercent, setBusyPercent] = useState<number | undefined>();
  const [dragOver, setDragOver] = useState<"photo" | "pdf" | null>(null);
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    size: number;
    kind: "photo" | "pdf";
    previewUrl?: string;
  } | null>(null);
  const [preview, setPreview] = useState<{
    parsed: ParsedPreview;
    form: FormState;
    duplicate?: boolean;
  } | null>(null);
  const [previewInvoiceNumber, setPreviewInvoiceNumber] = useState("");

  useEffect(() => {
    return () => {
      if (photoPreviewUrlRef.current) {
        URL.revokeObjectURL(photoPreviewUrlRef.current);
      }
    };
  }, []);

  function clearPhotoPreview() {
    if (photoPreviewUrlRef.current) {
      URL.revokeObjectURL(photoPreviewUrlRef.current);
      photoPreviewUrlRef.current = null;
    }
  }

  function resetInputs() {
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
    if (pdfInputRef.current) pdfInputRef.current.value = "";
  }

  function setFileSelection(file: File, kind: "photo" | "pdf") {
    clearPhotoPreview();
    const previewUrl =
      kind === "photo" ? createPhotoPreviewUrl(file) : undefined;
    if (previewUrl) photoPreviewUrlRef.current = previewUrl;
    setSelectedFile({
      name: file.name || (kind === "photo" ? "Camera photo" : "Invoice.pdf"),
      size: file.size,
      kind,
      previewUrl,
    });
  }

  function patchPreviewInvoiceNumber(
    data: {
      parsed: ParsedPreview;
      form: FormState;
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

  async function previewFromText(text: string) {
    setBusy(true);
    setBusyLabel("Parsing invoice fields…");
    setBusyPercent(undefined);
    onError("");
    lastTextRef.current = text;

    try {
      const res = await fetch("/api/orders/from-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          preview: true,
          invoiceNumberOverride: previewInvoiceNumber.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onError(data.error ?? "Could not read invoice");
        return;
      }
      const nextPreview = {
        parsed: data.parsed,
        form: data.form,
        duplicate: data.duplicate,
      };
      setPreview(nextPreview);
      setPreviewInvoiceNumber(data.parsed.invoiceNumber ?? "");
      if (data.parsed.warnings?.length) {
        onWarning(data.parsed.warnings.join(" "));
      }
    } catch {
      onError("Could not process invoice");
    } finally {
      setBusy(false);
      setBusyLabel("");
      setBusyPercent(undefined);
    }
  }

  async function handlePdfFile(file: File | null) {
    if (!file || !isInvoicePdfFile(file)) {
      onError("Choose a PDF invoice file");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      onError("PDF is too large (max 15 MB)");
      return;
    }

    lastFileRef.current = file;
    lastTextRef.current = "";
    setFileSelection(file, "pdf");
    setPreview(null);
    setBusy(true);
    setBusyLabel("Reading PDF…");
    setBusyPercent(undefined);
    onError("");

    const body = new FormData();
    body.append("file", file);
    body.append("preview", "true");

    try {
      const res = await fetch("/api/orders/from-invoice", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        onError(data.error ?? "Could not read invoice PDF");
        return;
      }
      setPreview({
        parsed: data.parsed,
        form: data.form,
        duplicate: data.duplicate,
      });
      setPreviewInvoiceNumber(data.parsed.invoiceNumber ?? "");
      if (data.parsed.warnings?.length) {
        onWarning(data.parsed.warnings.join(" "));
      }
    } catch {
      onError("Could not upload invoice PDF");
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }

  async function handlePhotoFile(file: File | null) {
    if (!file || !isInvoiceImageFile(file)) {
      onError("Choose a photo of the invoice");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      onError("Photo is too large (max 20 MB)");
      return;
    }

    lastFileRef.current = file;
    lastTextRef.current = "";
    setFileSelection(file, "photo");
    setPreview(null);
    setBusy(true);
    setBusyPercent(undefined);
    onError("");

    try {
      const text = await ocrInvoiceImage(file, (progress: OcrProgress) => {
        setBusyLabel(progress.label);
        setBusyPercent(progress.percent);
      });
      await previewFromText(text);
    } catch (err) {
      onError(
        err instanceof Error
          ? err.message
          : "Could not read the photo. Include the full page with good lighting."
      );
      setBusy(false);
      setBusyLabel("");
      setBusyPercent(undefined);
    }
  }

  async function createNow() {
    if (!preview) return;
    const invoiceNumber = previewInvoiceNumber.trim();
    if (!invoiceNumber) {
      onError("Enter the invoice number before creating the order");
      return;
    }

    setBusy(true);
    setBusyLabel("Creating order…");
    onError("");

    try {
      let res: Response;

      if (lastTextRef.current.trim()) {
        res = await fetch("/api/orders/from-invoice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: lastTextRef.current,
            create: true,
            invoiceNumberOverride: invoiceNumber,
          }),
        });
      } else if (lastFileRef.current && isInvoicePdfFile(lastFileRef.current)) {
        const body = new FormData();
        body.append("file", lastFileRef.current);
        body.append("create", "true");
        body.append("invoiceNumberOverride", invoiceNumber);
        res = await fetch("/api/orders/from-invoice", { method: "POST", body });
      } else {
        onError("Import again — no invoice data in memory");
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        if (data.form) {
          setPreview(
            patchPreviewInvoiceNumber(
              {
                parsed: data.parsed,
                form: data.form,
                duplicate: true,
              },
              invoiceNumber
            )
          );
        }
        onError(data.error ?? "Could not create order");
        return;
      }

      setPreview(null);
      setPreviewInvoiceNumber("");
      setSelectedFile(null);
      clearPhotoPreview();
      lastFileRef.current = null;
      lastTextRef.current = "";
      resetInputs();
      onWarning(`Order ${data.order.invoiceNumber} created from invoice`);
      onCreated();
    } catch {
      onError("Could not create order from invoice");
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }

  function handleDrop(kind: "photo" | "pdf", file: File | null) {
    setDragOver(null);
    if (!file) return;
    if (kind === "photo") void handlePhotoFile(file);
    else void handlePdfFile(file);
  }

  return (
    <Card className="mb-4 p-4">
      <div className="mb-4">
        <p className="text-sm font-semibold text-zinc-900">
          Import AGIMI invoice
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Photograph the full paper invoice or upload a PDF scan. Customer,
          address, tiles, and total are filled automatically. Use{" "}
          <span className="font-medium">Scan #</span> in the order form only for
          the invoice number barcode.
        </p>
      </div>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handlePhotoFile(e.target.files?.[0] ?? null)}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
        className="hidden"
        onChange={(e) => handlePhotoFile(e.target.files?.[0] ?? null)}
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => handlePdfFile(e.target.files?.[0] ?? null)}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div
          className={`rounded-xl border-2 border-dashed p-4 transition-colors ${
            dragOver === "photo"
              ? "border-zinc-900 bg-zinc-50"
              : "border-zinc-200 bg-zinc-50/50"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver("photo");
          }}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => {
            e.preventDefault();
            handleDrop("photo", e.dataTransfer.files?.[0] ?? null);
          }}
        >
          <p className="text-sm font-medium text-zinc-900">Photo invoice</p>
          <p className="mt-1 text-xs text-zinc-500">
            Full page, flat, good light. On phone, use the camera for best OCR.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={() => cameraInputRef.current?.click()}
            >
              {busy && selectedFile?.kind === "photo"
                ? busyLabel || "Working…"
                : "Take photo"}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => galleryInputRef.current?.click()}
            >
              Choose image
            </Button>
          </div>
        </div>

        <div
          className={`rounded-xl border-2 border-dashed p-4 transition-colors ${
            dragOver === "pdf"
              ? "border-zinc-900 bg-zinc-50"
              : "border-zinc-200 bg-zinc-50/50"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver("pdf");
          }}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0] ?? null;
            if (file && !isInvoicePdfFile(file)) {
              onError("Drop a PDF file here");
              setDragOver(null);
              return;
            }
            handleDrop("pdf", file);
          }}
        >
          <p className="text-sm font-medium text-zinc-900">PDF invoice</p>
          <p className="mt-1 text-xs text-zinc-500">
            Adobe Scan or email attachment. Most accurate import.
          </p>
          <Button
            className="mt-3"
            variant="secondary"
            disabled={busy}
            onClick={() => pdfInputRef.current?.click()}
          >
            {busy && selectedFile?.kind === "pdf"
              ? busyLabel || "Reading PDF…"
              : "Choose PDF"}
          </Button>
        </div>
      </div>

      {busy && (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-white px-3 py-2">
          <p className="text-xs font-medium text-zinc-700">
            {busyLabel || "Processing…"}
            {busyPercent != null ? ` (${busyPercent}%)` : ""}
          </p>
          <ProgressBar percent={busyPercent} />
        </div>
      )}

      {selectedFile && !preview && !busy && (
        <p className="mt-2 text-xs text-zinc-500">
          Last file: {selectedFile.name} · {formatImportFileSize(selectedFile.size)}
        </p>
      )}

      {selectedFile?.previewUrl && (
        <div className="mt-3 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selectedFile.previewUrl}
            alt="Invoice photo preview"
            className="max-h-48 w-full object-contain"
          />
        </div>
      )}

      {preview && (
        <div className="mt-4 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/80 p-3">
          {preview.duplicate && (
            <Alert tone="warning">
              Invoice {previewInvoiceNumber || preview.parsed.invoiceNumber}{" "}
              already exists — edit the number or review in the form.
            </Alert>
          )}

          <div>
            <label className="mb-1 block text-xs text-zinc-500">
              Invoice # (edit if OCR/PDF missed it)
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
              className="w-full rounded border border-zinc-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900"
              placeholder="26-SHV01-001-6263"
              spellCheck={false}
            />
          </div>

          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-zinc-500">Date</dt>
              <dd>{preview.parsed.orderDate}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Total</dt>
              <dd>{preview.parsed.price.toFixed(2)} EUR</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-zinc-500">Blerësi (customer)</dt>
              <dd className="font-bold text-zinc-900">
                {preview.parsed.customerName || "—"}
              </dd>
              {preview.parsed.customerPhone && (
                <dd className="mt-0.5 text-sm font-medium text-zinc-700">
                  Tel: {preview.parsed.customerPhone}
                </dd>
              )}
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-zinc-500">Delivery</dt>
              <dd>
                {preview.parsed.address}
                {preview.parsed.city ? ` · ${preview.parsed.city}` : ""}
                {preview.parsed.region ? ` (${preview.parsed.region})` : ""}
              </dd>
            </div>
            {preview.parsed.items.map((item, idx) => (
              <div key={idx} className="sm:col-span-2">
                <dt className="text-xs text-zinc-500">Product</dt>
                <dd>
                  {item.productName || "Tile"}{" "}
                  {item.tileWidthCm && item.tileHeightCm
                    ? `${item.tileWidthCm}×${item.tileHeightCm} cm`
                    : ""}
                  {item.quantityM2 != null
                    ? ` · ${formatM2(item.quantityM2)} m²`
                    : ""}
                </dd>
              </div>
            ))}
          </dl>

          {preview.parsed.warnings.length > 0 && (
            <ul className="text-xs text-amber-800">
              {preview.parsed.warnings.map((w) => (
                <li key={w}>• {w}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              disabled={busy || preview.duplicate || !previewInvoiceNumber.trim()}
              onClick={createNow}
            >
              {busy ? busyLabel || "Working…" : "Create order now"}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                onOpenForm(
                  patchPreviewInvoiceNumber(preview, previewInvoiceNumber).form
                );
                setPreview(null);
              }}
            >
              Review in form
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setPreview(null);
                setPreviewInvoiceNumber("");
                setSelectedFile(null);
                clearPhotoPreview();
                resetInputs();
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export type { FormState as InvoiceImportFormState };
