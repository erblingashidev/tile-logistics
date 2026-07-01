"use client";

import { useState } from "react";
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";
import { Button } from "@/components/ui";
import { normalizeScannedInvoiceNumber } from "@/lib/invoices/scan-utils";

interface InvoiceNumberFieldProps {
  label?: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
}

export function InvoiceNumberField({
  label = "Invoice #",
  required,
  value,
  onChange,
}: InvoiceNumberFieldProps) {
  const [scanOpen, setScanOpen] = useState(false);

  function handleScan(raw: string) {
    const normalized = normalizeScannedInvoiceNumber(raw);
    if (normalized) onChange(normalized);
  }

  return (
    <>
      <div>
        <span className="mb-1 block text-xs font-medium text-zinc-600">
          {label}
          {required && " *"}
        </span>
        <div className="flex gap-2">
          <input
            required={required}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="min-w-0 flex-1 rounded border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900"
            placeholder="26-SHV01-001-6263"
            autoComplete="off"
            spellCheck={false}
          />
          <Button
            type="button"
            variant="secondary"
            className="shrink-0 whitespace-nowrap px-3"
            onClick={() => setScanOpen(true)}
            aria-label="Scan invoice number barcode"
          >
            Scan #
          </Button>
        </div>
      </div>

      <BarcodeScannerModal
        open={scanOpen}
        variant="invoiceNumber"
        onClose={() => setScanOpen(false)}
        onScan={handleScan}
      />
    </>
  );
}
