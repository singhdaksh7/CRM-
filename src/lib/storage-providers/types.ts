/**
 * Provider-independent storage contract. src/lib/storage.ts (the public,
 * stable entry point every call site imports from) dispatches to whichever
 * of these implements the active STORAGE_PROVIDER - S3, R2, Firebase,
 * Mock, or Disabled. Adding a new provider means adding one file here, not
 * touching the Document Vault, property-image service, or any API route.
 */

export class StorageConfigError extends Error {}
export class StorageValidationError extends Error {}

export interface UploadAuthorizationInput {
  objectKey: string;
  mimeType: string;
  maxSizeBytes: number;
}

/**
 * `method: "PUT"` - the caller uploads directly to `uploadUrl` (S3/R2
 * presigned PUT); the server never sees the file bytes.
 * `method: "SERVER_MEDIATED"` - no `uploadUrl` is returned; the caller must
 * instead POST the file bytes through a server route, which calls
 * `uploadBuffer` (Firebase path).
 */
export interface UploadAuthorization {
  method: "PUT" | "SERVER_MEDIATED";
  uploadUrl?: string;
  objectKey: string;
  expiresInSeconds: number;
}

export interface VerifyUploadInput {
  objectKey: string;
}

export interface StoredObject {
  objectKey: string;
  sizeBytes: number;
  contentType: string | undefined;
}

export interface DownloadAuthorizationInput {
  objectKey: string;
  expiresInSeconds?: number;
  /** When set, signed GET responses include Content-Disposition (e.g. attachment for PDFs). */
  contentDisposition?: string;
}

export interface DownloadAuthorization {
  url: string;
  expiresInSeconds: number;
}

export interface StorageObjectMetadata {
  objectKey: string;
  sizeBytes: number;
  contentType: string | undefined;
  updatedAt?: Date;
}

export type StorageHealthStatus = "ok" | "not_configured" | "error";

export interface StorageHealthResult {
  status: StorageHealthStatus;
  detail: string;
}

/** Read-only readiness DTO - never uploads on page load. */
export interface StorageReadinessResult {
  provider: StorageProviderName;
  configured: boolean;
  bucketReachable: boolean | null;
  uploadCapability: boolean;
  deleteCapability: boolean;
  readCapability: boolean;
  detail: string;
}

export type StorageProviderName = "S3" | "R2" | "FIREBASE" | "MOCK" | "DISABLED";

export interface StorageProvider {
  readonly name: StorageProviderName;
  createUploadAuthorization(input: UploadAuthorizationInput): Promise<UploadAuthorization>;
  /** Only implemented by providers that accept server-held bytes (Firebase, S3/R2, Mock). */
  uploadBuffer?(objectKey: string, buffer: Buffer, mimeType: string): Promise<StoredObject>;
  verifyUpload(input: VerifyUploadInput): Promise<StoredObject>;
  createDownloadAuthorization(input: DownloadAuthorizationInput): Promise<DownloadAuthorization>;
  getMetadata(objectKey: string): Promise<StorageObjectMetadata>;
  deleteObject(objectKey: string): Promise<void>;
  /** Optional cheap existence check - falls back to getMetadata when absent. */
  exists?(objectKey: string): Promise<boolean>;
  checkHealth(): Promise<StorageHealthResult>;
}
