import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getStorageProvider, _resetStorageProviderCacheForTests } from "./index";
import { S3StorageProvider } from "./s3";
import { R2StorageProvider } from "./r2";
import { FirebaseStorageProvider } from "./firebase";
import { DisabledStorageProvider } from "./disabled";

let savedProvider: string | undefined;

beforeEach(() => {
  savedProvider = process.env.STORAGE_PROVIDER;
  _resetStorageProviderCacheForTests();
});

afterEach(() => {
  if (savedProvider === undefined) delete process.env.STORAGE_PROVIDER;
  else process.env.STORAGE_PROVIDER = savedProvider;
  _resetStorageProviderCacheForTests();
});

describe("getStorageProvider", () => {
  it("selects S3 when STORAGE_PROVIDER=S3", () => {
    process.env.STORAGE_PROVIDER = "S3";
    expect(getStorageProvider()).toBeInstanceOf(S3StorageProvider);
    expect(getStorageProvider().name).toBe("S3");
  });

  it("selects R2 when STORAGE_PROVIDER=R2", () => {
    process.env.STORAGE_PROVIDER = "R2";
    expect(getStorageProvider()).toBeInstanceOf(R2StorageProvider);
    expect(getStorageProvider().name).toBe("R2");
  });

  it("R2 is also an instance of S3StorageProvider (reuses the S3-compatible client)", () => {
    process.env.STORAGE_PROVIDER = "R2";
    expect(getStorageProvider()).toBeInstanceOf(S3StorageProvider);
  });

  it("selects Firebase when STORAGE_PROVIDER=FIREBASE", () => {
    process.env.STORAGE_PROVIDER = "FIREBASE";
    expect(getStorageProvider()).toBeInstanceOf(FirebaseStorageProvider);
    expect(getStorageProvider().name).toBe("FIREBASE");
  });

  it("selects Disabled when STORAGE_PROVIDER is unset", () => {
    delete process.env.STORAGE_PROVIDER;
    expect(getStorageProvider()).toBeInstanceOf(DisabledStorageProvider);
    expect(getStorageProvider().name).toBe("DISABLED");
  });

  it("selects Disabled when STORAGE_PROVIDER is DISABLED explicitly", () => {
    process.env.STORAGE_PROVIDER = "DISABLED";
    expect(getStorageProvider()).toBeInstanceOf(DisabledStorageProvider);
  });

  it("selects Disabled for an unrecognized value rather than throwing", () => {
    process.env.STORAGE_PROVIDER = "NOT_A_REAL_PROVIDER";
    expect(getStorageProvider()).toBeInstanceOf(DisabledStorageProvider);
  });

  it("is a singleton within the process (same instance across calls)", () => {
    process.env.STORAGE_PROVIDER = "S3";
    const first = getStorageProvider();
    const second = getStorageProvider();
    expect(first).toBe(second);
  });

  it("re-selects after the test-only cache reset", () => {
    process.env.STORAGE_PROVIDER = "S3";
    const first = getStorageProvider();
    _resetStorageProviderCacheForTests();
    process.env.STORAGE_PROVIDER = "FIREBASE";
    const second = getStorageProvider();
    expect(first).not.toBe(second);
    expect(second).toBeInstanceOf(FirebaseStorageProvider);
  });
});

describe("DisabledStorageProvider", () => {
  it("throws StorageConfigError from every mutating method", async () => {
    const provider = new DisabledStorageProvider();
    await expect(provider.createUploadAuthorization({ objectKey: "k", mimeType: "application/pdf", maxSizeBytes: 100 })).rejects.toThrow();
    await expect(provider.verifyUpload({ objectKey: "k" })).rejects.toThrow();
    await expect(provider.createDownloadAuthorization({ objectKey: "k" })).rejects.toThrow();
    await expect(provider.getMetadata("k")).rejects.toThrow();
    await expect(provider.deleteObject("k")).rejects.toThrow();
  });

  it("reports not_configured from checkHealth without throwing", async () => {
    const provider = new DisabledStorageProvider();
    const result = await provider.checkHealth();
    expect(result.status).toBe("not_configured");
  });
});

describe("S3StorageProvider.checkHealth", () => {
  it("reports not_configured when no S3 env vars are set", async () => {
    delete process.env.STORAGE_BUCKET;
    delete process.env.STORAGE_ACCESS_KEY_ID;
    delete process.env.STORAGE_SECRET_ACCESS_KEY;
    const provider = new S3StorageProvider();
    const result = await provider.checkHealth();
    expect(result.status).toBe("not_configured");
  });
});

describe("R2StorageProvider.checkHealth (config-existence only)", () => {
  it("reports not_configured when no R2 env vars are set", async () => {
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET_NAME;
    delete process.env.R2_ENDPOINT;
    const provider = new R2StorageProvider();
    const result = await provider.checkHealth();
    expect(result.status).toBe("not_configured");
  });
});
