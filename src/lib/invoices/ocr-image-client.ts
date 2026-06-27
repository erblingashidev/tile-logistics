"use client";

export type OcrProgress = {
  stage: "prepare" | "load" | "read" | "parse";
  label: string;
  percent?: number;
};

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
    quality: 0.9,
  });
  const blob = Array.isArray(result) ? result[0] : result;
  if (!blob) throw new Error("HEIC conversion failed");
  return blob;
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

    // Light contrast boost helps OCR on phone photos.
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const boosted = Math.min(255, Math.max(0, (gray - 128) * 1.15 + 128));
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

  if (file.type === "image/jpeg" || file.type === "image/png") {
    try {
      return await rasterizeToJpeg(file);
    } catch {
      return file;
    }
  }

  return rasterizeToJpeg(file);
}

const OCR_READ_ERROR =
  "Could not read this photo. Use JPG/PNG or PDF, or on iPhone set Camera → Formats → Most Compatible.";

/** Client-side OCR for photographed invoices (runs in the browser, not on Netlify). */
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

  onProgress?.({ stage: "load", label: "Loading text reader…" });

  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    logger: (message) => {
      if (message.status === "recognizing text" && onProgress) {
        onProgress({
          stage: "read",
          label: "Reading invoice text…",
          percent: Math.round((message.progress ?? 0) * 100),
        });
      }
    },
  });

  try {
    const {
      data: { text },
    } = await worker.recognize(imageBlob);
    const trimmed = text?.trim() ?? "";
    if (trimmed.length < 40) {
      throw new Error(
        "Photo text was too faint or cropped. Include the full invoice page with good lighting."
      );
    }
    return trimmed;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("attempting to read image")) {
      throw new Error(OCR_READ_ERROR);
    }
    throw err;
  } finally {
    await worker.terminate();
  }
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
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
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
