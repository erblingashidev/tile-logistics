"use client";

import {
  enhanceCanvasToJpeg,
  ocrPreparedBlob,
  type OcrProgress,
} from "@/lib/invoices/ocr-image-client";

const PDFJS_VERSION = "4.10.38";
const MAX_OCR_PAGES = 12;
const RENDER_SCALE = 2.2;

function pdfScanProgressPercent(
  pageNum: number,
  pageCount: number,
  pagePercent = 0
): number {
  if (pageCount <= 0) return 0;
  const clamped = Math.max(0, Math.min(100, pagePercent));
  return Math.min(
    99,
    Math.round(((pageNum - 1 + clamped / 100) / pageCount) * 100)
  );
}

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
  return pdfjs;
}

async function renderPdfPageToJpeg(
  page: import("pdfjs-dist").PDFPageProxy
): Promise<Blob> {
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: ctx,
    viewport,
  }).promise;

  return enhanceCanvasToJpeg(canvas);
}

/** OCR for scanned/image-only PDFs in the browser (Adobe Scan, etc.). */
export async function ocrScannedPdf(
  file: File,
  onProgress?: (progress: OcrProgress) => void
): Promise<string> {
  onProgress?.({
    stage: "render",
    label: "Opening scanned PDF…",
  });

  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;

  const pageCount = Math.min(doc.numPages, MAX_OCR_PAGES);
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    onProgress?.({
      stage: "render",
      label:
        pageCount > 1
          ? `Rendering page ${pageNum} of ${pageCount}…`
          : "Rendering PDF page…",
      percent:
        pageCount > 1
          ? pdfScanProgressPercent(pageNum, pageCount, 0)
          : undefined,
    });

    const page = await doc.getPage(pageNum);
    const jpeg = await renderPdfPageToJpeg(page);
    const text = await ocrPreparedBlob(jpeg, (progress) => {
      onProgress?.({
        stage: "read",
        label:
          pageCount > 1
            ? `Reading page ${pageNum} of ${pageCount}…`
            : progress.label,
        percent:
          pageCount > 1
            ? pdfScanProgressPercent(pageNum, pageCount, progress.percent ?? 0)
            : progress.percent,
      });
    });
    pageTexts.push(text);
  }

  onProgress?.({
    stage: "read",
    label: "Finishing…",
    percent: 100,
  });

  const combined = pageTexts.join("\n\n").trim();
  if (combined.length < 20) {
    throw new Error(
      "Could not read enough text from the PDF scan. Try a clearer scan or photograph the invoice."
    );
  }

  return combined;
}
