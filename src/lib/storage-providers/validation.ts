import { StorageValidationError } from "./types";

export type FileCategory = "PROPERTY_IMAGE" | "DOCUMENT";

export const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const DOCUMENT_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

export const MAX_PROPERTY_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024; // 25 MB

/** Every extension we accept must map to exactly the MIME type(s) it's allowed to declare - catches "invoice.pdf" uploaded as image/png, etc. */
const EXTENSION_MIME_MAP: Record<string, string[]> = {
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
  pdf: ["application/pdf"],
};

/** Extensions that are never allowed regardless of declared MIME type or category. */
const DANGEROUS_EXTENSIONS = new Set([
  "exe", "msi", "bat", "cmd", "com", "sh", "bash", "ps1",
  "js", "mjs", "cjs", "html", "htm", "svg", "xhtml",
  "zip", "rar", "7z", "tar", "gz", "bz2", "iso",
  "dll", "so", "jar", "apk", "app", "dmg",
  "php", "py", "rb", "pl", "cgi",
]);

function allowedMimeTypesFor(category: FileCategory): Set<string> {
  return category === "PROPERTY_IMAGE" ? IMAGE_MIME_TYPES : DOCUMENT_MIME_TYPES;
}

function maxBytesFor(category: FileCategory): number {
  return category === "PROPERTY_IMAGE" ? MAX_PROPERTY_IMAGE_BYTES : MAX_DOCUMENT_BYTES;
}

/**
 * Full pre-authorization validation: size, declared MIME against the
 * category allowlist, extension against a denylist of dangerous types, and
 * extension/MIME consistency (rejects a mismatched pair even if each is
 * independently "allowed" - e.g. a .pdf extension declaring image/png).
 * Also rejects double extensions like "resume.pdf.exe" or "photo.jpg.html".
 */
export function assertFileAllowed(params: { category: FileCategory; fileName: string; mimeType: string; sizeBytes: number }): void {
  const { category, fileName, mimeType, sizeBytes } = params;

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new StorageValidationError("File is empty");
  }
  const maxBytes = maxBytesFor(category);
  if (sizeBytes > maxBytes) {
    throw new StorageValidationError(`File is ${sizeBytes} bytes, exceeding the ${maxBytes} byte limit for ${category}`);
  }

  const allowedMime = allowedMimeTypesFor(category);
  if (!allowedMime.has(mimeType)) {
    throw new StorageValidationError(`MIME type "${mimeType}" is not allowed for ${category}. Allowed: ${[...allowedMime].join(", ")}`);
  }

  const lowerName = fileName.toLowerCase();
  const nameParts = lowerName.split(".");
  if (nameParts.length < 2 || nameParts[nameParts.length - 1].length === 0) {
    throw new StorageValidationError("File name must include an extension");
  }

  // Reject double extensions: any extension-shaped segment before the final
  // one that is itself a recognized or dangerous extension.
  for (let i = 1; i < nameParts.length - 1; i++) {
    const segment = nameParts[i];
    if (DANGEROUS_EXTENSIONS.has(segment) || segment in EXTENSION_MIME_MAP) {
      throw new StorageValidationError(`File name "${fileName}" has multiple extensions, which is not allowed`);
    }
  }

  const ext = nameParts[nameParts.length - 1];
  if (DANGEROUS_EXTENSIONS.has(ext)) {
    throw new StorageValidationError(`File extension ".${ext}" is not allowed`);
  }
  const expectedMimes = EXTENSION_MIME_MAP[ext];
  if (!expectedMimes) {
    throw new StorageValidationError(`Unrecognized file extension ".${ext}"`);
  }
  if (!expectedMimes.includes(mimeType)) {
    throw new StorageValidationError(`File extension ".${ext}" does not match declared type "${mimeType}"`);
  }
}

const MAGIC_BYTE_SIGNATURES: { mime: string; bytes: number[] }[] = [
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] }, // "%PDF"
];

/** Sniffs the actual file signature - a declared MIME type is never trusted alone. Returns null if no known signature matches. */
export function detectMimeFromMagicBytes(buffer: Uint8Array): string | null {
  for (const sig of MAGIC_BYTE_SIGNATURES) {
    if (buffer.length >= sig.bytes.length && sig.bytes.every((b, i) => buffer[i] === b)) return sig.mime;
  }
  // WebP: "RIFF" at 0-3, "WEBP" at 8-11
  if (buffer.length >= 12) {
    const riff = String.fromCharCode(buffer[0], buffer[1], buffer[2], buffer[3]);
    const webp = String.fromCharCode(buffer[8], buffer[9], buffer[10], buffer[11]);
    if (riff === "RIFF" && webp === "WEBP") return "image/webp";
  }
  return null;
}

/** Post-upload verification step: confirms the bytes actually match the declared type, not just the file name/header the client sent. */
export function assertMagicBytesMatch(declaredMimeType: string, buffer: Uint8Array): void {
  const detected = detectMimeFromMagicBytes(buffer);
  if (!detected) {
    throw new StorageValidationError("Could not verify file signature - file may be corrupted or of a disallowed type");
  }
  if (detected !== declaredMimeType) {
    throw new StorageValidationError(`File signature indicates "${detected}" but declared type was "${declaredMimeType}"`);
  }
}
