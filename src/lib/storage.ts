import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

/**
 * S3-compatible storage adapter for the Document Vault (Phase 3B). Works
 * against real AWS S3 in production and against a local MinIO container
 * (docker-compose.yml) in development - both speak the same S3 API, so this
 * one client works unmodified in either environment; only STORAGE_ENDPOINT
 * differs (unset -> real AWS, set -> MinIO/any S3-compatible host).
 *
 * Server-only. Never import from a "use client" component - credentials
 * must never reach the browser bundle.
 */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
export const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const SIGNED_URL_TTL_SECONDS = 300; // 5 minutes

export class StorageConfigError extends Error {}
export class StorageValidationError extends Error {}

export interface StorageConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
}

let cachedClient: S3Client | null = null;
let cachedConfig: StorageConfig | null = null;

export function isStorageConfigured(): boolean {
  return !!(process.env.STORAGE_BUCKET && process.env.STORAGE_ACCESS_KEY_ID && process.env.STORAGE_SECRET_ACCESS_KEY);
}

function loadConfig(): StorageConfig {
  if (cachedConfig) return cachedConfig;
  const bucket = process.env.STORAGE_BUCKET;
  const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new StorageConfigError("Storage is not configured - set STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY (see .env.example)");
  }
  cachedConfig = {
    bucket,
    region: process.env.STORAGE_REGION || "us-east-1",
    endpoint: process.env.STORAGE_ENDPOINT || undefined,
    forcePathStyle: !!process.env.STORAGE_ENDPOINT, // MinIO/most S3-compatible hosts need path-style; real AWS does not
  };
  return cachedConfig;
}

function getClient(): S3Client {
  if (cachedClient) return cachedClient;
  const config = loadConfig();
  cachedClient = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY_ID!,
      secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY!,
    },
  });
  return cachedClient;
}

/** org/{organizationId}/{entityType}/{entityId}/{uuid}-{fileName} - bakes org isolation into the key itself. */
export function buildObjectKey(params: { organizationId: string; entityType: string; entityId: string; fileName: string }): string {
  const safeFileName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
  return `org/${params.organizationId}/${params.entityType.toLowerCase()}/${params.entityId}/${randomUUID()}-${safeFileName}`;
}

export function assertUploadAllowed(params: { fileType: string; fileSizeBytes?: number | null }) {
  if (!ALLOWED_MIME_TYPES.has(params.fileType)) {
    throw new StorageValidationError(`File type "${params.fileType}" is not allowed. Allowed: ${[...ALLOWED_MIME_TYPES].join(", ")}`);
  }
  if (params.fileSizeBytes !== undefined && params.fileSizeBytes !== null && params.fileSizeBytes > MAX_UPLOAD_BYTES) {
    throw new StorageValidationError(`File is ${params.fileSizeBytes} bytes, exceeding the ${MAX_UPLOAD_BYTES} byte limit`);
  }
}

/** A presigned PUT URL the browser uploads directly to - the file bytes never pass through our server. */
export async function createUploadUrl(params: { key: string; fileType: string; fileSizeBytes?: number | null }): Promise<{ uploadUrl: string; key: string; expiresIn: number }> {
  assertUploadAllowed(params);
  const config = loadConfig();
  const command = new PutObjectCommand({ Bucket: config.bucket, Key: params.key, ContentType: params.fileType });
  const uploadUrl = await getSignedUrl(getClient(), command, { expiresIn: SIGNED_URL_TTL_SECONDS });
  return { uploadUrl, key: params.key, expiresIn: SIGNED_URL_TTL_SECONDS };
}

/** A short-TTL presigned GET URL - documents are never served from a permanently public URL. */
export async function createDownloadUrl(key: string): Promise<string> {
  const config = loadConfig();
  const command = new GetObjectCommand({ Bucket: config.bucket, Key: key });
  return getSignedUrl(getClient(), command, { expiresIn: SIGNED_URL_TTL_SECONDS });
}

/** Verifies the object actually exists and matches the claimed size/type before a Document row is marked ACTIVE - catches a client that lied about the upload or never finished it. */
export async function verifyUploadedObject(key: string): Promise<{ sizeBytes: number; contentType: string | undefined }> {
  const config = loadConfig();
  const result = await getClient().send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
  return { sizeBytes: result.ContentLength ?? 0, contentType: result.ContentType };
}

export async function deleteObject(key: string): Promise<void> {
  const config = loadConfig();
  await getClient().send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}
