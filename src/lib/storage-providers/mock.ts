import type {
  StorageProvider,
  UploadAuthorizationInput,
  UploadAuthorization,
  VerifyUploadInput,
  StoredObject,
  DownloadAuthorizationInput,
  DownloadAuthorization,
  StorageObjectMetadata,
  StorageHealthResult,
} from "./types";
import { StorageConfigError } from "./types";

interface MockObject {
  body: Buffer;
  contentType: string;
  updatedAt: Date;
  contentDisposition?: string;
}

/**
 * Deterministic in-memory storage for tests and local development without
 * credentials. No network I/O. Process-local Map keyed by object key.
 */
export class MockStorageProvider implements StorageProvider {
  readonly name = "MOCK" as const;
  private readonly objects = new Map<string, MockObject>();
  private readonly pendingUploads = new Map<string, { mimeType: string; maxSizeBytes: number; expiresAt: number }>();

  clear(): void {
    this.objects.clear();
    this.pendingUploads.clear();
  }

  /** Test helper - simulate a completed direct PUT without HTTP. */
  putObject(objectKey: string, body: Buffer, contentType: string, contentDisposition?: string): void {
    this.objects.set(objectKey, { body: Buffer.from(body), contentType, updatedAt: new Date(), contentDisposition });
  }

  async createUploadAuthorization(input: UploadAuthorizationInput): Promise<UploadAuthorization> {
    const expiresInSeconds = 300;
    this.pendingUploads.set(input.objectKey, {
      mimeType: input.mimeType,
      maxSizeBytes: input.maxSizeBytes,
      expiresAt: Date.now() + expiresInSeconds * 1000,
    });
    return {
      method: "PUT",
      uploadUrl: `mock://upload/${encodeURIComponent(input.objectKey)}`,
      objectKey: input.objectKey,
      expiresInSeconds,
    };
  }

  async uploadBuffer(objectKey: string, buffer: Buffer, mimeType: string): Promise<StoredObject> {
    this.objects.set(objectKey, { body: Buffer.from(buffer), contentType: mimeType, updatedAt: new Date() });
    this.pendingUploads.delete(objectKey);
    return { objectKey, sizeBytes: buffer.byteLength, contentType: mimeType };
  }

  async verifyUpload(input: VerifyUploadInput): Promise<StoredObject> {
    const obj = this.objects.get(input.objectKey);
    if (!obj) throw new StorageConfigError(`Object not found in mock storage: ${input.objectKey}`);
    return { objectKey: input.objectKey, sizeBytes: obj.body.byteLength, contentType: obj.contentType };
  }

  async createDownloadAuthorization(input: DownloadAuthorizationInput): Promise<DownloadAuthorization> {
    const obj = this.objects.get(input.objectKey);
    if (!obj) throw new StorageConfigError(`Object not found in mock storage: ${input.objectKey}`);
    const expiresInSeconds = input.expiresInSeconds ?? 300;
    const disposition = input.contentDisposition ? `&disposition=${encodeURIComponent(input.contentDisposition)}` : "";
    return {
      url: `mock://download/${encodeURIComponent(input.objectKey)}?exp=${expiresInSeconds}${disposition}`,
      expiresInSeconds,
    };
  }

  async getMetadata(objectKey: string): Promise<StorageObjectMetadata> {
    const obj = this.objects.get(objectKey);
    if (!obj) throw new StorageConfigError(`Object not found in mock storage: ${objectKey}`);
    return { objectKey, sizeBytes: obj.body.byteLength, contentType: obj.contentType, updatedAt: obj.updatedAt };
  }

  async exists(objectKey: string): Promise<boolean> {
    return this.objects.has(objectKey);
  }

  async deleteObject(objectKey: string): Promise<void> {
    this.objects.delete(objectKey);
    this.pendingUploads.delete(objectKey);
  }

  async checkHealth(): Promise<StorageHealthResult> {
    return { status: "ok", detail: `Mock in-memory storage configured (${this.objects.size} objects)` };
  }

  /** Test helper - list keys under a prefix (bounded orphan detection). */
  listKeys(prefix: string): string[] {
    return [...this.objects.keys()].filter((k) => k.startsWith(prefix));
  }
}
