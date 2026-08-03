import { getStorageProvider } from "./storage-providers";
import { StorageConfigError, StorageValidationError } from "./storage-providers/types";
import { MAX_DOCUMENT_BYTES, DOCUMENT_MIME_TYPES } from "./storage-providers/validation";
import type { StorageHealthResult } from "./storage-providers/types";

/**
 * Stable, provider-independent storage entry point - every call site
 * (Document Vault routes, lib/documents.ts, system-status.ts) imports from
 * here, never from a specific provider. Which provider actually runs
 * (S3, Firebase, or Disabled) is chosen once via STORAGE_PROVIDER and
 * dispatched through src/lib/storage-providers/index.ts.
 *
 * Server-only. Never import from a "use client" component - credentials
 * must never reach the browser bundle.
 */

export { StorageConfigError, StorageValidationError };
export { buildObjectKey, buildDocumentObjectKey, buildPropertyImageObjectKey, sanitizeExtension } from "./storage-providers/object-key";
export { assertFileAllowed, assertMagicBytesMatch, detectMimeFromMagicBytes, MAX_PROPERTY_IMAGE_BYTES, MAX_DOCUMENT_BYTES, IMAGE_MIME_TYPES, DOCUMENT_MIME_TYPES } from "./storage-providers/validation";
export type { FileCategory } from "./storage-providers/validation";
export type { StorageHealthResult } from "./storage-providers/types";

// Legacy aliases kept for anything still importing the pre-provider-abstraction names.
export const MAX_UPLOAD_BYTES = MAX_DOCUMENT_BYTES;
export const ALLOWED_MIME_TYPES = DOCUMENT_MIME_TYPES;

export function isStorageConfigured(): boolean {
  return getStorageProvider().name !== "DISABLED";
}

export function activeStorageProviderName(): "S3" | "R2" | "FIREBASE" | "DISABLED" {
  return getStorageProvider().name;
}

export function assertUploadAllowed(params: { fileType: string; fileSizeBytes?: number | null }): void {
  if (!DOCUMENT_MIME_TYPES.has(params.fileType)) {
    throw new StorageValidationError(`File type "${params.fileType}" is not allowed. Allowed: ${[...DOCUMENT_MIME_TYPES].join(", ")}`);
  }
  if (params.fileSizeBytes !== undefined && params.fileSizeBytes !== null && params.fileSizeBytes > MAX_DOCUMENT_BYTES) {
    throw new StorageValidationError(`File is ${params.fileSizeBytes} bytes, exceeding the ${MAX_DOCUMENT_BYTES} byte limit`);
  }
}

/**
 * Step 1 of the S3 upload flow: a presigned PUT URL the browser uploads
 * directly to (`method: "PUT"`). For a server-mediated provider (Firebase),
 * there is no uploadUrl - the caller must instead send the file bytes to a
 * server route that calls `uploadFileBuffer` (`method: "SERVER_MEDIATED"`).
 */
export async function createUploadUrl(params: { key: string; fileType: string; fileSizeBytes?: number | null }): Promise<{ method: "PUT" | "SERVER_MEDIATED"; uploadUrl?: string; key: string; expiresIn: number }> {
  assertUploadAllowed(params);
  const provider = getStorageProvider();
  const auth = await provider.createUploadAuthorization({
    objectKey: params.key,
    mimeType: params.fileType,
    maxSizeBytes: params.fileSizeBytes ?? MAX_DOCUMENT_BYTES,
  });
  return { method: auth.method, uploadUrl: auth.uploadUrl, key: auth.objectKey, expiresIn: auth.expiresInSeconds };
}

/** Server-mediated upload path (Firebase, or S3 via a server route instead of a presigned PUT) - pushes bytes the server already received to the bucket. */
export async function uploadFileBuffer(key: string, buffer: Buffer, mimeType: string) {
  const provider = getStorageProvider();
  if (!provider.uploadBuffer) {
    throw new StorageConfigError(`Provider "${provider.name}" does not support server-mediated upload`);
  }
  return provider.uploadBuffer(key, buffer, mimeType);
}

/** A short-TTL signed GET URL - documents are never served from a permanently public URL. Default 5 minutes; callers may request up to 15 per the Phase 1 spec. */
export async function createDownloadUrl(key: string, expiresInSeconds?: number): Promise<string> {
  const provider = getStorageProvider();
  const auth = await provider.createDownloadAuthorization({ objectKey: key, expiresInSeconds });
  return auth.url;
}

/** Verifies the object actually exists and matches the claimed size/type before a Document row is marked ACTIVE - catches a client that lied about the upload or never finished it. */
export async function verifyUploadedObject(key: string): Promise<{ sizeBytes: number; contentType: string | undefined }> {
  const provider = getStorageProvider();
  const result = await provider.verifyUpload({ objectKey: key });
  return { sizeBytes: result.sizeBytes, contentType: result.contentType };
}

export async function deleteObject(key: string): Promise<void> {
  const provider = getStorageProvider();
  await provider.deleteObject(key);
}

export async function checkStorageHealth(): Promise<StorageHealthResult> {
  return getStorageProvider().checkHealth();
}

export async function getObjectMetadata(key: string) {
  return getStorageProvider().getMetadata(key);
}
