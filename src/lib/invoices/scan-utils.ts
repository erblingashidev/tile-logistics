/** Client-safe helpers for barcode / invoice number scanning. */

export function normalizeScannedInvoiceNumber(raw: string): string {
  return raw
    .trim()
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}
