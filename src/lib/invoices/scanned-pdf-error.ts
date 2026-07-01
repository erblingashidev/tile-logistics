/** Shared code when a PDF has no embedded text layer (image scan). */
export const SCANNED_PDF_CODE = "SCANNED_PDF" as const;

export class ScannedPdfError extends Error {
  readonly code = SCANNED_PDF_CODE;

  constructor(
    message = "This PDF is a scan with no selectable text."
  ) {
    super(message);
    this.name = "ScannedPdfError";
  }
}

export function isScannedPdfErrorMessage(error: string, code?: string): boolean {
  return (
    code === SCANNED_PDF_CODE ||
    /no selectable text|image-only|scanned pdf/i.test(error)
  );
}
