import { ScannedPdfError } from "@/lib/invoices/scanned-pdf-error";

type PdfParseFn = (buffer: Buffer) => Promise<{ text?: string; numpages?: number }>;

async function loadPdfParser(): Promise<PdfParseFn> {
  const mod = await import("pdf-parse/lib/pdf-parse.js");
  const parser = mod.default;
  if (typeof parser !== "function") {
    throw new Error("PDF parser failed to load");
  }
  return parser;
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  if (!buffer.length) {
    throw new Error("PDF file is empty");
  }

  const pdfParse = await loadPdfParser();
  const result = await pdfParse(buffer);
  const text = (result.text ?? "").replace(/\r/g, "\n").trim();

  if (!text) {
    throw new ScannedPdfError();
  }

  return text;
}
