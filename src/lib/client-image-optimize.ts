"use client";

import { IMAGE_OPTIMIZE } from "@/lib/storage-providers/validation";
import { sanitizeOriginalFilename } from "@/lib/image-optimize";

export interface OptimizedImage {
  blob: Blob;
  fileName: string;
  mimeType: "image/webp" | "image/jpeg";
  width: number;
  height: number;
  originalBytes: number;
  optimizedBytes: number;
}

/**
 * Resize + WebP encode in the browser. Drawing onto a canvas strips EXIF
 * (including GPS). Falls back to JPEG if WebP encoding is unavailable.
 */
export async function optimizePropertyImageFile(file: File, opts?: { longEdgePx?: number; quality?: number }): Promise<OptimizedImage> {
  const longEdge = opts?.longEdgePx ?? IMAGE_OPTIMIZE.maxLongEdgePx;
  const quality = opts?.quality ?? IMAGE_OPTIMIZE.webpQuality;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const webpBlob = await canvasToBlob(canvas, "image/webp", quality);
  const blob = webpBlob ?? (await canvasToBlob(canvas, "image/jpeg", quality));
  if (!blob) throw new Error("Image optimization failed");

  const mimeType = (blob.type === "image/webp" ? "image/webp" : "image/jpeg") as OptimizedImage["mimeType"];
  const base = sanitizeOriginalFilename(file.name).replace(/\.[^.]+$/, "");
  const fileName = `${base}.${mimeType === "image/webp" ? "webp" : "jpg"}`;

  return {
    blob,
    fileName,
    mimeType,
    width,
    height,
    originalBytes: file.size,
    optimizedBytes: blob.size,
  };
}

export async function createThumbnailBlob(file: File): Promise<Blob | null> {
  try {
    const optimized = await optimizePropertyImageFile(file, {
      longEdgePx: IMAGE_OPTIMIZE.thumbnailLongEdgePx,
      quality: IMAGE_OPTIMIZE.thumbnailQuality,
    });
    return optimized.blob;
  } catch {
    return null;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}
