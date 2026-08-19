import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { StorageConfigError } from "./types";
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

const DEFAULT_TTL_SECONDS = 300; // 5 minutes

interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
}

/**
 * S3-compatible storage adapter for the Document Vault. Works against real
 * AWS S3 in production and against a local MinIO container
 * (docker-compose.yml) in development - both speak the same S3 API, so this
 * one client works unmodified in either environment; only STORAGE_ENDPOINT
 * differs (unset -> real AWS, set -> MinIO/any S3-compatible host).
 *
 * Every config-reading step is a small protected method rather than inline
 * `process.env` access so `R2StorageProvider` (r2.ts) can subclass this and
 * override only the parts that genuinely differ for Cloudflare R2 (env var
 * names, forced "auto" region, endpoint derivation, TTL default, messages) -
 * every HEAD/PUT/GET/DELETE command and the presigned-URL logic is reused
 * completely unmodified.
 */
export class S3StorageProvider implements StorageProvider {
  readonly name: "S3" | "R2" = "S3";

  protected cachedClient: S3Client | null = null;
  protected cachedConfig: S3Config | null = null;

  protected getBucket(): string | undefined {
    return process.env.STORAGE_BUCKET;
  }

  protected getAccessKeyId(): string | undefined {
    return process.env.STORAGE_ACCESS_KEY_ID;
  }

  protected getSecretAccessKey(): string | undefined {
    return process.env.STORAGE_SECRET_ACCESS_KEY;
  }

  protected getRegion(): string {
    return process.env.STORAGE_REGION || "us-east-1";
  }

  protected getEndpoint(): string | undefined {
    return process.env.STORAGE_ENDPOINT || undefined;
  }

  /** MinIO/most S3-compatible hosts need path-style; real AWS does not. Overridden by R2, which uses virtual-hosted style per Cloudflare's documented example. */
  protected getForcePathStyle(endpoint: string | undefined): boolean {
    return !!endpoint;
  }

  protected getDefaultTtlSeconds(): number {
    return DEFAULT_TTL_SECONDS;
  }

  protected getNotConfiguredMessage(): string {
    return "S3 storage is not configured - set STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY (see .env.example)";
  }

  isConfigured(): boolean {
    return !!(this.getBucket() && this.getAccessKeyId() && this.getSecretAccessKey());
  }

  protected loadConfig(): S3Config {
    if (this.cachedConfig) return this.cachedConfig;
    const bucket = this.getBucket();
    const accessKeyId = this.getAccessKeyId();
    const secretAccessKey = this.getSecretAccessKey();
    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new StorageConfigError(this.getNotConfiguredMessage());
    }
    const endpoint = this.getEndpoint();
    this.cachedConfig = {
      bucket,
      region: this.getRegion(),
      endpoint,
      forcePathStyle: this.getForcePathStyle(endpoint),
    };
    return this.cachedConfig;
  }

  protected getClient(): S3Client {
    if (this.cachedClient) return this.cachedClient;
    const config = this.loadConfig();
    this.cachedClient = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: this.getAccessKeyId()!,
        secretAccessKey: this.getSecretAccessKey()!,
      },
      // AWS SDK JS v3 (>=3.729 / flexible checksums) defaults to
      // requestChecksumCalculation=WHEN_SUPPORTED, which injects
      // x-amz-checksum-crc32 + x-amz-sdk-checksum-algorithm into PutObject
      // (and therefore into browser presigned PUT URLs). Browsers only send
      // Content-Type for our direct upload path, so R2 rejects those URLs.
      // WHEN_REQUIRED keeps optional CRC32 off unless an API mandates it.
      // Never strip checksum query params after signing - that invalidates
      // the signature; configure the client instead.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    return this.cachedClient;
  }

  /** A presigned PUT URL the browser uploads directly to - the file bytes never pass through our server. */
  async createUploadAuthorization(input: UploadAuthorizationInput): Promise<UploadAuthorization> {
    const config = this.loadConfig();
    const ttl = this.getDefaultTtlSeconds();
    const command = new PutObjectCommand({ Bucket: config.bucket, Key: input.objectKey, ContentType: input.mimeType });
    const uploadUrl = await getSignedUrl(this.getClient(), command, { expiresIn: ttl });
    return { method: "PUT", uploadUrl, objectKey: input.objectKey, expiresInSeconds: ttl };
  }

  /** Direct server-side put, for symmetry with the Firebase provider's server-mediated flow (e.g. a shared multipart upload route that works against either provider). */
  async uploadBuffer(objectKey: string, buffer: Buffer, mimeType: string): Promise<StoredObject> {
    const config = this.loadConfig();
    await this.getClient().send(new PutObjectCommand({ Bucket: config.bucket, Key: objectKey, Body: buffer, ContentType: mimeType }));
    return { objectKey, sizeBytes: buffer.byteLength, contentType: mimeType };
  }

  /** Verifies the object actually exists and reports its real size/type - catches a client that lied about the upload or never finished it. */
  async verifyUpload(input: VerifyUploadInput): Promise<StoredObject> {
    const config = this.loadConfig();
    const result = await this.getClient().send(new HeadObjectCommand({ Bucket: config.bucket, Key: input.objectKey }));
    return { objectKey: input.objectKey, sizeBytes: result.ContentLength ?? 0, contentType: result.ContentType };
  }

  /** A short-TTL presigned GET URL - documents are never served from a permanently public URL. */
  async createDownloadAuthorization(input: DownloadAuthorizationInput): Promise<DownloadAuthorization> {
    const config = this.loadConfig();
    const expiresInSeconds = input.expiresInSeconds ?? this.getDefaultTtlSeconds();
    const command = new GetObjectCommand({
      Bucket: config.bucket,
      Key: input.objectKey,
      ...(input.contentDisposition ? { ResponseContentDisposition: input.contentDisposition } : {}),
    });
    const url = await getSignedUrl(this.getClient(), command, { expiresIn: expiresInSeconds });
    return { url, expiresInSeconds };
  }

  async getMetadata(objectKey: string): Promise<StorageObjectMetadata> {
    const config = this.loadConfig();
    const result = await this.getClient().send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }));
    return { objectKey, sizeBytes: result.ContentLength ?? 0, contentType: result.ContentType, updatedAt: result.LastModified };
  }

  async exists(objectKey: string): Promise<boolean> {
    try {
      await this.getMetadata(objectKey);
      return true;
    } catch {
      return false;
    }
  }

  async deleteObject(objectKey: string): Promise<void> {
    const config = this.loadConfig();
    await this.getClient().send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }));
  }

  protected getNotConfiguredHealthDetail(): string {
    return "STORAGE_BUCKET/STORAGE_ACCESS_KEY_ID/STORAGE_SECRET_ACCESS_KEY not fully set";
  }

  protected getHealthOkDetail(config: S3Config): string {
    const endpoint = config.endpoint ? `custom endpoint (${config.endpoint})` : "AWS S3";
    return `S3-compatible storage configured - bucket "${config.bucket}" via ${endpoint}`;
  }

  async checkHealth(): Promise<StorageHealthResult> {
    if (!this.isConfigured()) {
      return { status: "not_configured", detail: this.getNotConfiguredHealthDetail() };
    }
    try {
      const config = this.loadConfig();
      return { status: "ok", detail: this.getHealthOkDetail(config) };
    } catch (err) {
      return { status: "error", detail: err instanceof Error ? err.message : "Storage health check failed" };
    }
  }
}
