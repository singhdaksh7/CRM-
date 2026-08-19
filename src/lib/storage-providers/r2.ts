import { S3StorageProvider } from "./s3";

const R2_DEFAULT_TTL_SECONDS = 300; // 5 minutes - matches the S3 provider's default and the Phase 1 spec's 5-15 min window

/**
 * Cloudflare R2 - preferred production storage provider. R2 exposes an
 * S3-compatible API, so this subclasses S3StorageProvider and reuses every
 * HEAD/PUT/GET/DELETE command and the presigned-URL logic completely
 * unmodified; only the configuration source differs:
 *
 * - Reads R2_* env vars instead of STORAGE_*.
 * - Region is always "auto" (R2 has no AWS-style regions - never derive one).
 * - Endpoint is `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` unless
 *   R2_ENDPOINT is set explicitly. Never derived from R2_PUBLIC_BASE_URL -
 *   that variable (if ever set) is for serving already-public assets from a
 *   custom domain, and R2 presigned URLs must use the S3 API hostname.
 * - forcePathStyle is false, matching Cloudflare's documented S3Client
 *   example (unlike MinIO/most other S3-compatible hosts, which need
 *   path-style addressing).
 * - Signed-URL TTL defaults to R2_SIGNED_URL_EXPIRY_SECONDS (falling back to
 *   300s) rather than the base class's hardcoded default.
 * - Inherits S3Client requestChecksumCalculation=WHEN_REQUIRED from the base
 *   class so browser presigned PUTs do not require CRC32 query/header pairs
 *   that the client never sends.
 */
export class R2StorageProvider extends S3StorageProvider {
  readonly name = "R2" as const;

  protected override getBucket(): string | undefined {
    return process.env.R2_BUCKET_NAME;
  }

  protected override getAccessKeyId(): string | undefined {
    return process.env.R2_ACCESS_KEY_ID;
  }

  protected override getSecretAccessKey(): string | undefined {
    return process.env.R2_SECRET_ACCESS_KEY;
  }

  /** R2 has no AWS-style regions - "auto" is the only correct value, never read from env or derived. */
  protected override getRegion(): string {
    return "auto";
  }

  protected override getEndpoint(): string | undefined {
    const explicit = process.env.R2_ENDPOINT?.trim();
    if (explicit) return explicit;
    const accountId = process.env.R2_ACCOUNT_ID?.trim();
    return accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined;
  }

  /** Cloudflare's documented S3Client example does not set forcePathStyle - R2 supports virtual-hosted-style addressing, unlike MinIO. */
  protected override getForcePathStyle(): boolean {
    return false;
  }

  protected override getDefaultTtlSeconds(): number {
    const raw = Number(process.env.R2_SIGNED_URL_EXPIRY_SECONDS);
    return Number.isFinite(raw) && raw > 0 ? raw : R2_DEFAULT_TTL_SECONDS;
  }

  protected override getNotConfiguredMessage(): string {
    return "Cloudflare R2 storage is not configured - set R2_ACCOUNT_ID (or R2_ENDPOINT), R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME (see .env.example)";
  }

  protected override getNotConfiguredHealthDetail(): string {
    return "R2_ACCOUNT_ID (or R2_ENDPOINT), R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, or R2_BUCKET_NAME not fully set";
  }

  protected override getHealthOkDetail(config: { bucket: string }): string {
    return `Cloudflare R2 configured - bucket "${config.bucket}"`;
  }

  /** isConfigured() also requires a resolvable endpoint (R2_ACCOUNT_ID or R2_ENDPOINT) - the base class only checks bucket/keys since S3 can default to real AWS with no endpoint at all. */
  override isConfigured(): boolean {
    return !!(this.getBucket() && this.getAccessKeyId() && this.getSecretAccessKey() && this.getEndpoint());
  }
}
