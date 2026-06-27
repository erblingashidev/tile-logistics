"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { normalizeScannedInvoiceNumber } from "@/lib/invoices/scan-utils";

type ScannerVariant = "invoiceNumber" | "default";

interface BarcodeScannerModalProps {
  open: boolean;
  title?: string;
  hint?: string;
  variant?: ScannerVariant;
  onClose: () => void;
  onScan: (value: string) => void;
}

const VARIANT_COPY: Record<
  ScannerVariant,
  { title: string; hint: string }
> = {
  invoiceNumber: {
    title: "Scan invoice number barcode",
    hint: "Point at the fiscal barcode on the top-right of the AGIMI invoice (e.g. 26-SHV01-001-6263). Hold steady in the box.",
  },
  default: {
    title: "Scan barcode",
    hint: "Align the barcode in the box. Supports Code 128, EAN, and QR.",
  },
};

export function BarcodeScannerModal({
  open,
  title,
  hint,
  variant = "default",
  onClose,
  onScan,
}: BarcodeScannerModalProps) {
  const copy = VARIANT_COPY[variant];
  const regionId = useId().replace(/:/g, "");
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const handledRef = useRef(false);
  onScanRef.current = onScan;
  onCloseRef.current = onClose;

  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [successValue, setSuccessValue] = useState("");

  useEffect(() => {
    if (!open) {
      setSuccessValue("");
      setError("");
      handledRef.current = false;
      return;
    }

    let cancelled = false;

    async function start() {
      setError("");
      setStarting(true);
      handledRef.current = false;

      try {
        const {
          Html5Qrcode,
          Html5QrcodeSupportedFormats,
        } = await import("html5-qrcode");

        if (cancelled) return;

        const formats = [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.QR_CODE,
        ];

        const scanner = new Html5Qrcode(regionId, {
          formatsToSupport: formats,
          verbose: false,
        });
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const width = Math.min(viewfinderWidth * 0.92, 360);
              const height = Math.min(
                viewfinderHeight * (variant === "invoiceNumber" ? 0.22 : 0.35),
                variant === "invoiceNumber" ? 100 : 140
              );
              return { width, height };
            },
            aspectRatio: 1.777,
            disableFlip: false,
          },
          (decoded) => {
            if (handledRef.current) return;
            const value = normalizeScannedInvoiceNumber(decoded);
            if (!value) return;
            handledRef.current = true;
            setSuccessValue(value);
            void scanner.stop().then(() => {
              scannerRef.current = null;
              window.setTimeout(() => {
                onScanRef.current(value);
                onCloseRef.current();
              }, 450);
            });
          },
          () => {}
        );
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not open camera — allow camera access and try again."
          );
        }
      } finally {
        if (!cancelled) setStarting(false);
      }
    }

    void start();

    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        void scanner.stop().catch(() => {});
      }
    };
  }, [open, regionId, variant]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="border-b border-zinc-200 px-4 py-3">
          <p className="font-semibold text-zinc-900">{title ?? copy.title}</p>
          <p className="mt-1 text-xs text-zinc-500">{hint ?? copy.hint}</p>
        </div>

        <div className="relative bg-zinc-900 p-2">
          <div
            id={regionId}
            className="min-h-[260px] w-full overflow-hidden rounded-lg"
          />
          {successValue && (
            <div className="absolute inset-2 flex items-center justify-center rounded-lg bg-emerald-600/90">
              <div className="text-center text-white">
                <p className="text-lg font-semibold">Scanned</p>
                <p className="mt-1 font-mono text-sm">{successValue}</p>
              </div>
            </div>
          )}
        </div>

        {starting && !successValue && (
          <p className="px-4 py-2 text-xs text-zinc-500">Starting camera…</p>
        )}
        {error && (
          <p className="px-4 py-2 text-sm text-red-700">{error}</p>
        )}

        <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
