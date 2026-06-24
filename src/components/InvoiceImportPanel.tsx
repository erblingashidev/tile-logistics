"use client";

import { useRef, useState } from "react";
import { Alert, Button, Card } from "@/components/ui";
import { formatM2 } from "@/lib/calculations";

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

export function InvoiceImportPanel({
  onOpenForm,
  onCreated,
  onError,
  onWarning,
}: InvoiceImportPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    parsed: ParsedPreview;
    form: FormState;
    duplicate?: boolean;
  } | null>(null);
  const [fileName, setFileName] = useState("");

  async function handleFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setPreview(null);
    onError("");
    setFileName(file.name);

    const body = new FormData();
    body.append("file", file);
    body.append("preview", "true");

    try {
      const res = await fetch("/api/orders/from-invoice", {
        method: "POST",
        body,
      });
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
      if (data.parsed.warnings?.length) {
        onWarning(data.parsed.warnings.join(" "));
      }
    } catch {
      onError("Could not upload invoice PDF");
    } finally {
      setBusy(false);
    }
  }

  async function createNow() {
    if (!inputRef.current?.files?.[0]) return;
    setBusy(true);
    onError("");
    const body = new FormData();
    body.append("file", inputRef.current.files[0]);
    body.append("create", "true");

    try {
      const res = await fetch("/api/orders/from-invoice", {
        method: "POST",
        body,
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.form) {
          setPreview({
            parsed: data.parsed,
            form: data.form,
            duplicate: true,
          });
        }
        onError(data.error ?? "Could not create order");
        return;
      }
      setPreview(null);
      setFileName("");
      if (inputRef.current) inputRef.current.value = "";
      onWarning(`Order ${data.order.invoiceNumber} created from invoice PDF`);
      onCreated();
    } catch {
      onError("Could not create order from PDF");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-900">
            Import from AGIMI invoice (PDF)
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Upload a scanned or digital invoice — customer, delivery address, tile
            line (m², size), and total are filled automatically. Review before
            saving.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "Reading PDF…" : "Choose invoice PDF"}
          </Button>
        </div>
      </div>

      {fileName && !preview && !busy && (
        <p className="mt-2 text-xs text-zinc-500">Selected: {fileName}</p>
      )}

      {preview && (
        <div className="mt-4 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/80 p-3">
          {preview.duplicate && (
            <Alert tone="warning">
              Invoice {preview.parsed.invoiceNumber} already exists — edit in
              form or use a different number.
            </Alert>
          )}

          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-zinc-500">Invoice #</dt>
              <dd className="font-medium">{preview.parsed.invoiceNumber || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Date</dt>
              <dd>{preview.parsed.orderDate}</dd>
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
            <div>
              <dt className="text-xs text-zinc-500">Total</dt>
              <dd>{preview.parsed.price.toFixed(2)} EUR</dd>
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
                  {item.quantityM2 != null ? ` · ${formatM2(item.quantityM2)} m²` : ""}
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
              disabled={busy || preview.duplicate}
              onClick={createNow}
            >
              Create order now
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                onOpenForm(preview.form);
                setPreview(null);
              }}
            >
              Review in form
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setPreview(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export type { FormState as InvoiceImportFormState };
