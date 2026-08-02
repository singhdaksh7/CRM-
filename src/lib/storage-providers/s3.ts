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
 */
export class S3StorageProvider implements StorageProvider {
  readonly name = "S3" as const;

  private cachedClient: S3Client | null = null;
  private cachedConfig: S3Config | null = null;

  isConfigured(): boolean {
    return !!(process.env.STORAGE_BUCKET && process.env.STORAGE_ACCESS_KEY_ID && process.env.STORAGE_SECRET_ACCESS_KEY);
  }

  private loadConfig(): S3Config {
    if (this.cachedConfig) return this.cachedConfig;
    const bucket = process.env.STORAGE_BUCKET;
    const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
    const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;
    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new StorageConfigError("S3 storage is not configured - set STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY (see .env.example)");
    }
    this.cachedConfig = {
      bucket,
      region: process.env.STORAGE_REGION || "us-east-1",
      endpoint: process.env.STORAGE_ENDPOINT || undefined,
      forcePathStyle: !!process.env.STORAGE_ENDPOINT, // MinIO/most S3-compatible hosts need path-style; real AWS does not
    };
    return this.cachedConfig;
  }

  private getClient(): S3Client {
    if (this.cachedClient) return this.cachedClient;
    const config = this.loadConfig();
    this.cachedClient = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY_ID!,
        secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY!,
      },
    });
    return this.cachedClient;
  }

  /** A presigned PUT URL the browser uploads directly to - the file bytes never pass through our server. */
  async createUploadAuthorization(input: UploadAuthorizationInput): Promise<UploadAuthorization> {
    const config = this.loadConfig();
    const command = new PutObjectCommand({ Bucket: config.bucket, Key: input.objectKey, ContentType: input.mimeType });
    const uploadUrl = await getSignedUrl(this.getClient(), command, { expiresIn: DEFAULT_TTL_SECONDS });
    return { method: "PUT", uploadUrl, objectKey: input.objectKey, expiresInSeconds: DEFAULT_TTL_SECONDS };
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
    const expiresInSeconds = input.expiresInSeconds ?? DEFAULT_TTL_SECONDS;
    const command = new GetObjectCommand({ Bucket: config.bucket, Key: input.objectKey });
    const url = await getSignedUrl(this.getClient(), command, { expiresIn: expiresInSeconds });
    return { url, expiresInSeconds };
  }

  async getMetadata(objectKey: string): Promise<StorageObjectMetadata> {
    const config = this.loadConfig();
    const result = await this.getClient().send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey }));
    return { objectKey, sizeBytes: result.ContentLength ?? 0, contentType: result.ContentType, updatedAt: result.LastModified };
  }

  async deleteObject(objectKey: string): Promise<void> {
    const config = this.loadConfig();
    await this.getClient().send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }));
  }

  async checkHealth(): Promise<StorageHealthResult> {
    if (!this.isConfigured()) {
      return { status: "not_configured", detail: "STORAGE_BUCKET/STORAGE_ACCESS_KEY_ID/STORAGE_SECRET_ACCESS_KEY not fully set" };
    }
    try {
      const config = this.loadConfig();
      const endpoint = config.endpoint ? `custom endpoint (${config.endpoint})` : "AWS S3";
      return { status: "ok", detail: `S3-compatible storage configured - bucket "${config.bucket}" via ${endpoint}` };
    } catch (err) {
      return { status: "error", detail: err instanceof Error ? err.message : "S3 health check failed" };
    }
  }
}
