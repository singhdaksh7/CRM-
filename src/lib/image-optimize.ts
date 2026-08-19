/**
 * Centralized image optimization policy for property media.
 * Prefer client-side canvas preprocessing before signed upload so Vercel
 * never holds multi-megabyte phone photos. Canvas redraw strips EXIF/GPS.
 */

import { IMAGE_OPTIMIZE, MAX_PROPERTY_IMAGE_BYTES } from "./storage-providers/validation";

export { IMAGE_OPTIMIZE, MAX_PROPERTY_IMAGE_BYTES };

export function sanitizeOriginalFilename(fileName: string): string {
  const cleaned = fileName
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\.\./g, "_")
    .replace(/[\\/]/g, "_")
    .replace(/^[=\+\-@]/, "_") // formula-injection guard for CSV exports
    .trim()
    .slice(0, 200);
  return cleaned.length > 0 ? cleaned : "image.webp";
}

export function buildContentDisposition(fileName: string, inline: boolean): string {
  const safe = sanitizeOriginalFilename(fileName).replace(/"/g, "");
  const type = inline ? "inline" : "attachment";
  return `${type}; filename="${safe}"`;
}
