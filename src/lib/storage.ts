import { getStorageProvider } from "./storage-providers";
import { StorageConfigError, StorageValidationError } from "./storage-providers/types";
import {
  MAX_DOCUMENT_BYTES,
  DOCUMENT_MIME_TYPES,
  assertFileAllowed,
} from "./storage-providers/validation";
import type { StorageHealthResult, StorageReadinessResult, StorageProviderName } from "./storage-providers/types";

/**
 * Stable, provider-independent storage entry point - every call site
 * imports from here, never from a specific provider. Server-only.
 */

export { StorageConfigError, StorageValidationError };
export { buildObjectKey, buildDocumentObjectKey, buildPropertyImageObjectKey, sanitizeExtension } from "./storage-providers/object-key";
export {
  assertFileAllowed,
  assertMagicBytesMatch,
  detectMimeFromMagicBytes,
  MAX_PROPERTY_IMAGE_BYTES,
  MAX_DOCUMENT_BYTES,
  MAX_PROPERTY_IMAGE_COUNT_DEFAULT,
  IMAGE_MIME_TYPES,
  DOCUMENT_MIME_TYPES,
} from "./storage-providers/validation";
export type { FileCategory } from "./storage-providers/validation";
export type { StorageHealthResult, StorageReadinessResult, StorageProviderName } from "./storage-providers/types";

export const MAX_UPLOAD_BYTES = MAX_DOCUMENT_BYTES;
export const ALLOWED_MIME_TYPES = DOCUMENT_MIME_TYPES;

export function isStorageConfigured(): boolean {
  const name = getStorageProvider().name;
  return name !== "DISABLED";
}

export function activeStorageProviderName(): StorageProviderName {
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

export async function createUploadUrl(params: {
  key: string;
  fileType: string;
  fileSizeBytes?: number | null;
}): Promise<{ method: "PUT" | "SERVER_MEDIATED"; uploadUrl?: string; key: string; expiresIn: number }> {
  assertUploadAllowed(params);
  const provider = getStorageProvider();
  const auth = await provider.createUploadAuthorization({
    objectKey: params.key,
    mimeType: params.fileType,
    maxSizeBytes: params.fileSizeBytes ?? MAX_DOCUMENT_BYTES,
  });
  return { method: auth.method, uploadUrl: auth.uploadUrl, key: auth.objectKey, expiresIn: auth.expiresInSeconds };
}

/** Property-image variant - validates against IMAGE allowlist, not document PDF list. */
export async function createPropertyImageUploadUrl(params: {
  key: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
}): Promise<{ method: "PUT" | "SERVER_MEDIATED"; uploadUrl?: string; key: string; expiresIn: number }> {
  assertFileAllowed({ category: "PROPERTY_IMAGE", fileName: params.fileName, mimeType: params.fileType, sizeBytes: params.fileSizeBytes });
  const provider = getStorageProvider();
  const auth = await provider.createUploadAuthorization({
    objectKey: params.key,
    mimeType: params.fileType,
    maxSizeBytes: params.fileSizeBytes,
  });
  return { method: auth.method, uploadUrl: auth.uploadUrl, key: auth.objectKey, expiresIn: auth.expiresInSeconds };
}

export async function uploadFileBuffer(key: string, buffer: Buffer, mimeType: string) {
  const provider = getStorageProvider();
  if (!provider.uploadBuffer) {
    throw new StorageConfigError(`Provider "${provider.name}" does not support server-mediated upload`);
  }
  return provider.uploadBuffer(key, buffer, mimeType);
}

export async function createDownloadUrl(
  key: string,
  expiresInSeconds?: number,
  contentDisposition?: string
): Promise<string> {
  const provider = getStorageProvider();
  const auth = await provider.createDownloadAuthorization({ objectKey: key, expiresInSeconds, contentDisposition });
  return auth.url;
}

export async function verifyUploadedObject(key: string): Promise<{ sizeBytes: number; contentType: string | undefined }> {
  const provider = getStorageProvider();
  const result = await provider.verifyUpload({ objectKey: key });
  return { sizeBytes: result.sizeBytes, contentType: result.contentType };
}

export async function deleteObject(key: string): Promise<void> {
  const provider = getStorageProvider();
  await provider.deleteObject(objectKeySafe(key));
}

export async function objectExists(key: string): Promise<boolean> {
  const provider = getStorageProvider();
  if (provider.exists) return provider.exists(key);
  try {
    await provider.getMetadata(key);
    return true;
  } catch {
    return false;
  }
}

export async function checkStorageHealth(): Promise<StorageHealthResult> {
  return getStorageProvider().checkHealth();
}

export async function getObjectMetadata(key: string) {
  return getStorageProvider().getMetadata(key);
}

/** Reject empty / traversal-shaped keys before any provider call. */
function objectKeySafe(key: string): string {
  if (!key || key.includes("..") || key.includes("\0") || key.startsWith("/")) {
    throw new StorageValidationError("Invalid object key");
  }
  return key;
}

export async function getStorageReadiness(): Promise<StorageReadinessResult> {
  const provider = getStorageProvider();
  const configured = provider.name !== "DISABLED";
  if (!configured) {
    return {
      provider: provider.name,
      configured: false,
      bucketReachable: null,
      uploadCapability: false,
      deleteCapability: false,
      readCapability: false,
      detail: "Storage is not configured",
    };
  }

  const health = await provider.checkHealth();
  const ok = health.status === "ok";
  // Configured providers advertise capabilities from their interface shape;
  // we do NOT upload a probe object on readiness reads.
  return {
    provider: provider.name,
    configured: true,
    bucketReachable: ok ? true : health.status === "error" ? false : null,
    uploadCapability: ok && (!!provider.uploadBuffer || provider.name === "S3" || provider.name === "R2" || provider.name === "MOCK"),
    deleteCapability: ok,
    readCapability: ok,
    detail: health.detail,
  };
}
