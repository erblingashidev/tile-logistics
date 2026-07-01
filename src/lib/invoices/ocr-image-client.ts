"use client";

import type { Worker } from "tesseract.js";

export type OcrProgress = {
  stage: "prepare" | "render" | "load" | "read";
  label: string;
  percent?: number;
};

const TESSERACT_VERSION = "7.0.0";

function isHeicFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    /\.heic$/i.test(name) ||
    /\.heif$/i.test(name)
  );
}

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = url;
  });
}

async function convertHeicToJpeg(file: File): Promise<Blob> {
  const { default: heic2any } = await import("heic2any");
  const result = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.92,
  });
  const blob = Array.isArray(result) ? result[0] : result;
  if (!blob) throw new Error("HEIC conversion failed");
  return blob;
}

export async function enhanceCanvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const boosted = Math.min(255, Math.max(0, (gray - 128) * 1.12 + 128));
    data[i] = boosted;
    data[i + 1] = boosted;
    data[i + 2] = boosted;
  }
  ctx.putImageData(imageData, 0, 0);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not encode image")),
      "image/jpeg",
      0.92
    );
  });
}

async function rasterizeToJpeg(file: File | Blob): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImageFromUrl(url);
    const maxDim = 2600;
    let { width, height } = img;
    if (Math.max(width, height) > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    return enhanceCanvasToJpeg(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function prepareImageForOcr(
  file: File,
  onProgress?: (progress: OcrProgress) => void
): Promise<Blob> {
  onProgress?.({ stage: "prepare", label: "Preparing photo…" });

  if (isHeicFile(file)) {
    try {
      return await convertHeicToJpeg(file);
    } catch {
      return rasterizeToJpeg(file);
    }
  }

  try {
    return await rasterizeToJpeg(file);
  } catch {
    return file;
  }
}

let workerPromise: Promise<Worker> | null = null;
/** Updated before each recognize() so multi-page PDF OCR reports the current page. */
let activeOcrProgress: ((progress: OcrProgress) => void) | undefined;

async function getOcrWorker(): Promise<Worker> {
  if (workerPromise) return workerPromise;

  workerPromise = (async () => {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng", 1, {
      workerPath: `https://cdn.jsdelivr.net/npm/tesseract.js@v${TESSERACT_VERSION}/dist/worker.min.js`,
      logger: (message) => {
        if (message.status === "recognizing text" && activeOcrProgress) {
          activeOcrProgress({
            stage: "read",
            label: "Reading invoice text…",
            percent: Math.round((message.progress ?? 0) * 100),
          });
        }
      },
    });
    return worker;
  })();

  workerPromise.catch(() => {
    workerPromise = null;
  });

  return workerPromise;
}

const OCR_READ_ERROR =
  "Could not read this image. Include the full invoice page with good lighting.";

/** Run Tesseract on a prepared JPEG blob. */
export async function ocrPreparedBlob(
  imageBlob: Blob,
  onProgress?: (progress: OcrProgress) => void
): Promise<string> {
  activeOcrProgress = onProgress;
  try {
    if (onProgress && !workerPromise) {
      onProgress({ stage: "load", label: "Loading text reader…" });
    }
    const worker = await getOcrWorker();
    const {
      data: { text },
    } = await worker.recognize(imageBlob);
    const trimmed = text?.replace(/\r/g, "\n").trim() ?? "";
    if (trimmed.length < 20) {
      throw new Error(
        "Not enough text detected. Flatten the invoice, reduce glare, and include all four corners."
      );
    }
    return trimmed;
  } catch (err) {
    workerPromise = null;
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("attempting to read image")) {
      throw new Error(OCR_READ_ERROR);
    }
    if (msg.includes("Failed to fetch") || msg.includes("importScripts")) {
      throw new Error(
        "OCR could not load (network blocked). Check your connection and try again."
      );
    }
    throw err;
  } finally {
    if (activeOcrProgress === onProgress) {
      activeOcrProgress = undefined;
    }
  }
}

/** Client-side OCR for photographed invoices (runs in the browser). */
export async function ocrInvoiceImage(
  file: File,
  onProgress?: (progress: OcrProgress) => void
): Promise<string> {
  let imageBlob: Blob;
  try {
    imageBlob = await prepareImageForOcr(file, onProgress);
  } catch {
    throw new Error(OCR_READ_ERROR);
  }

  return ocrPreparedBlob(imageBlob, onProgress);
}

/** OCR several invoice photos and join text (multi-page invoices). */
export async function ocrInvoiceImages(
  files: File[],
  onProgress?: (progress: OcrProgress & { page?: number; pageCount?: number }) => void
): Promise<string> {
  const parts: string[] = [];

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    onProgress?.({
      stage: "read",
      label: `Reading page ${index + 1} of ${files.length}…`,
      page: index + 1,
      pageCount: files.length,
    });

    const text = await ocrInvoiceImage(file, (progress) => {
      onProgress?.({
        ...progress,
        label:
          files.length > 1
            ? `Page ${index + 1}/${files.length}: ${progress.label}`
            : progress.label,
        page: index + 1,
        pageCount: files.length,
      });
    });

    parts.push(
      `--- page-${String(index + 1).padStart(2, "0")} ---\n${text.trim()}`
    );
  }

  return parts.join("\n\n");
}

export function isInvoiceImageFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type.startsWith("image/") ||
    /\.(jpe?g|png|webp|heic|heif)$/i.test(name)
  );
}

export function isInvoicePdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

export function formatImportFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function createPhotoPreviewUrl(file: File): string {
  return URL.createObjectURL(file);
}
