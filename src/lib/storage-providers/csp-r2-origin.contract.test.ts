/**
 * Ensures CSP allows the *actual* hostname emitted by AWS SDK getSignedUrl
 * for R2 (virtual-hosted), not only the configured R2_ENDPOINT origin.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { buildContentSecurityPolicy, cspDirectiveSources } from "../csp";
import { R2StorageProvider } from "./r2";

const ACCOUNT_ID = "4fd436c71901fb085c2c0e3d88cfc820";
const BUCKET = "kp-crm-media-prod";
const ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;

const ENV_KEYS = [
  "STORAGE_PROVIDER",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_ENDPOINT",
] as const;

const saved: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  process.env.STORAGE_PROVIDER = "R2";
  process.env.R2_ACCOUNT_ID = ACCOUNT_ID;
  process.env.R2_ACCESS_KEY_ID = "AKIATEST";
  process.env.R2_SECRET_ACCESS_KEY = "secret_test_value";
  process.env.R2_BUCKET_NAME = BUCKET;
  process.env.R2_ENDPOINT = ENDPOINT;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("CSP vs real R2 SDK URL origins", () => {
  it("connect-src includes the origin of a real-format R2 presigned PUT", async () => {
    const provider = new R2StorageProvider();
    const auth = await provider.createUploadAuthorization({
      objectKey: "organizations/org/properties/p/images/x.webp",
      mimeType: "image/webp",
      maxSizeBytes: 1_000_000,
    });
    expect(auth.uploadUrl).toBeTruthy();
    const putOrigin = new URL(auth.uploadUrl!).origin;
    expect(putOrigin).toBe(`https://${BUCKET}.${ACCOUNT_ID}.r2.cloudflarestorage.com`);

    const csp = buildContentSecurityPolicy(process.env);
    const connect = cspDirectiveSources(csp, "connect-src");
    expect(connect).toContain(putOrigin);
    expect(connect).toContain(ENDPOINT);
  });

  it("img-src includes the origin of a real-format R2 presigned GET", async () => {
    const client = new S3Client({
      region: "auto",
      endpoint: ENDPOINT,
      forcePathStyle: false,
      credentials: { accessKeyId: "AKIATEST", secretAccessKey: "secret_test_value" },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    const getUrl = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: "organizations/org/properties/p/images/x.webp",
      }),
      { expiresIn: 300 }
    );
    const getOrigin = new URL(getUrl).origin;
    expect(getOrigin).toBe(`https://${BUCKET}.${ACCOUNT_ID}.r2.cloudflarestorage.com`);

    const csp = buildContentSecurityPolicy(process.env);
    const img = cspDirectiveSources(csp, "img-src");
    expect(img).toContain(getOrigin);
    expect(img).toContain("blob:");
  });

  it("raw SDK PutObjectCommand origin matches CSP (same as provider path)", async () => {
    const client = new S3Client({
      region: "auto",
      endpoint: ENDPOINT,
      forcePathStyle: false,
      credentials: { accessKeyId: "AKIATEST", secretAccessKey: "secret_test_value" },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    const putUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: "organizations/org/properties/p/images/y.webp",
        ContentType: "image/webp",
      }),
      { expiresIn: 300 }
    );
    const csp = buildContentSecurityPolicy({
      STORAGE_PROVIDER: "R2",
      R2_ENDPOINT: ENDPOINT,
      R2_ACCOUNT_ID: ACCOUNT_ID,
      R2_BUCKET_NAME: BUCKET,
    });
    expect(cspDirectiveSources(csp, "connect-src")).toContain(new URL(putUrl).origin);
  });
});
