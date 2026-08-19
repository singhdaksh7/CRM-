/**
 * Real AWS SDK contract tests for R2/S3 browser presigned PUT URLs.
 * Intentionally does NOT mock @aws-sdk/* - signing is local and needs no network.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { R2StorageProvider } from "./r2";
import { S3StorageProvider } from "./s3";

const ENV_KEYS = [
  "STORAGE_PROVIDER",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_ENDPOINT",
  "R2_SIGNED_URL_EXPIRY_SECONDS",
  "STORAGE_BUCKET",
  "STORAGE_ACCESS_KEY_ID",
  "STORAGE_SECRET_ACCESS_KEY",
  "STORAGE_REGION",
  "STORAGE_ENDPOINT",
] as const;

const saved: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function assertBrowserPutContract(uploadUrl: string, expectedKey: string) {
  const url = new URL(uploadUrl);
  // Never assert/log the signature value itself - only presence.
  expect(url.searchParams.has("X-Amz-Signature")).toBe(true);
  expect(url.searchParams.has("X-Amz-Expires") || url.searchParams.has("X-Amz-Date")).toBe(true);
  expect(url.searchParams.has("x-amz-checksum-crc32")).toBe(false);
  expect(url.searchParams.has("x-amz-sdk-checksum-algorithm")).toBe(false);
  expect(url.pathname).toContain(expectedKey.split("/").map(encodeURIComponent).join("/").replace(/%2F/g, "/"));
  // Path may be virtual-hosted; key must appear in path.
  expect(decodeURIComponent(url.pathname)).toContain("images/");
}

describe("S3Client flexible checksum defaults (SDK regression)", () => {
  it("documents that WHEN_SUPPORTED injects CRC32 into PutObject presigns", async () => {
    const client = new S3Client({
      region: "auto",
      endpoint: "https://4fd436c71901fb085c2c0e3d88cfc820.r2.cloudflarestorage.com",
      forcePathStyle: false,
      credentials: { accessKeyId: "AKIATEST", secretAccessKey: "secret_test_value" },
      // omit requestChecksumCalculation -> SDK default WHEN_SUPPORTED
    });
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: "kp-crm-media-prod",
        Key: "organizations/org/properties/p/images/x.webp",
        ContentType: "image/webp",
      }),
      { expiresIn: 300 }
    );
    const params = new URL(url).searchParams;
    expect(params.get("x-amz-sdk-checksum-algorithm")).toBe("CRC32");
    expect(params.has("x-amz-checksum-crc32")).toBe(true);
  });

  it("WHEN_REQUIRED removes automatic CRC32 from PutObject presigns", async () => {
    const client = new S3Client({
      region: "auto",
      endpoint: "https://4fd436c71901fb085c2c0e3d88cfc820.r2.cloudflarestorage.com",
      forcePathStyle: false,
      credentials: { accessKeyId: "AKIATEST", secretAccessKey: "secret_test_value" },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: "kp-crm-media-prod",
        Key: "organizations/org/properties/p/images/x.webp",
        ContentType: "image/webp",
      }),
      { expiresIn: 300 }
    );
    const params = new URL(url).searchParams;
    expect(params.has("x-amz-sdk-checksum-algorithm")).toBe(false);
    expect(params.has("x-amz-checksum-crc32")).toBe(false);
  });
});

describe("R2StorageProvider browser PUT contract", () => {
  it("presigns image/webp without checksum query requirements", async () => {
    process.env.R2_ACCOUNT_ID = "4fd436c71901fb085c2c0e3d88cfc820";
    process.env.R2_ACCESS_KEY_ID = "AKIATEST";
    process.env.R2_SECRET_ACCESS_KEY = "secret_test_value";
    process.env.R2_BUCKET_NAME = "kp-crm-media-prod";
    delete process.env.R2_ENDPOINT;

    const key = "organizations/org_default/properties/prop1/images/demo.webp";
    const provider = new R2StorageProvider();
    const auth = await provider.createUploadAuthorization({
      objectKey: key,
      mimeType: "image/webp",
      maxSizeBytes: 1_000_000,
    });

    expect(auth.method).toBe("PUT");
    expect(auth.expiresInSeconds).toBe(300);
    expect(auth.objectKey).toBe(key);
    expect(auth.uploadUrl).toBeTruthy();
    assertBrowserPutContract(auth.uploadUrl!, key);
  });

  it("presigns JPEG and PNG mime types the same way (WebP path uses image/webp after client optimize)", async () => {
    process.env.R2_ACCOUNT_ID = "4fd436c71901fb085c2c0e3d88cfc820";
    process.env.R2_ACCESS_KEY_ID = "AKIATEST";
    process.env.R2_SECRET_ACCESS_KEY = "secret_test_value";
    process.env.R2_BUCKET_NAME = "kp-crm-media-prod";

    const provider = new R2StorageProvider();
    for (const mimeType of ["image/jpeg", "image/png", "image/webp"] as const) {
      const key = `organizations/org_default/properties/prop1/images/from-${mimeType.split("/")[1]}.bin`;
      const auth = await provider.createUploadAuthorization({
        objectKey: key,
        mimeType,
        maxSizeBytes: 1_000_000,
      });
      expect(auth.uploadUrl).toBeTruthy();
      assertBrowserPutContract(auth.uploadUrl!, key);
    }
  });
});

describe("S3StorageProvider checksum client config", () => {
  it("also uses WHEN_REQUIRED so MinIO/S3 browser PUTs stay simple", async () => {
    process.env.STORAGE_BUCKET = "local-bucket";
    process.env.STORAGE_ACCESS_KEY_ID = "minio";
    process.env.STORAGE_SECRET_ACCESS_KEY = "minio123";
    process.env.STORAGE_REGION = "us-east-1";
    process.env.STORAGE_ENDPOINT = "http://127.0.0.1:9000";

    const key = "organizations/org/properties/p/images/x.webp";
    const provider = new S3StorageProvider();
    const auth = await provider.createUploadAuthorization({
      objectKey: key,
      mimeType: "image/webp",
      maxSizeBytes: 1000,
    });
    expect(auth.uploadUrl).toBeTruthy();
    assertBrowserPutContract(auth.uploadUrl!, key);
  });
});
