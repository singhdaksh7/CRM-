import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { sendMock, getSignedUrlMock, capturedOptions, constructorSpy } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- rest param exists only so TS accepts the spread call site in the mock factory below
  getSignedUrlMock: vi.fn(async (..._args: unknown[]) => "https://signed.example/should-never-be-logged"),
  capturedOptions: { value: null as unknown },
  constructorSpy: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => {
  class MockS3Client {
    send = sendMock;
    constructor(options: unknown) {
      constructorSpy(options);
      capturedOptions.value = options;
    }
  }
  class MockCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  return {
    S3Client: MockS3Client,
    PutObjectCommand: MockCommand,
    GetObjectCommand: MockCommand,
    DeleteObjectCommand: MockCommand,
    HeadObjectCommand: MockCommand,
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrlMock(...args),
}));

const { R2StorageProvider } = await import("./r2");
const { StorageConfigError } = await import("./types");

const ENV_KEYS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_ENDPOINT",
  "R2_SIGNED_URL_EXPIRY_SECONDS",
  "STORAGE_REGION",
] as const;
const saved: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

beforeEach(() => {
  vi.clearAllMocks();
  capturedOptions.value = null;
  for (const key of ENV_KEYS) saved[key] = process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function setFullConfig() {
  process.env.R2_ACCOUNT_ID = "acct123";
  process.env.R2_ACCESS_KEY_ID = "test-access-key";
  process.env.R2_SECRET_ACCESS_KEY = "super-secret-value";
  process.env.R2_BUCKET_NAME = "test-bucket";
  delete process.env.R2_ENDPOINT;
  delete process.env.R2_SIGNED_URL_EXPIRY_SECONDS;
}

describe("R2StorageProvider - configuration", () => {
  it("reports name R2", () => {
    expect(new R2StorageProvider().name).toBe("R2");
  });

  it("is not configured when R2_ACCOUNT_ID and R2_ENDPOINT are both missing", () => {
    setFullConfig();
    delete process.env.R2_ACCOUNT_ID;
    expect(new R2StorageProvider().isConfigured()).toBe(false);
  });

  it("is not configured when R2_ACCESS_KEY_ID is missing", () => {
    setFullConfig();
    delete process.env.R2_ACCESS_KEY_ID;
    expect(new R2StorageProvider().isConfigured()).toBe(false);
  });

  it("is not configured when R2_SECRET_ACCESS_KEY is missing", () => {
    setFullConfig();
    delete process.env.R2_SECRET_ACCESS_KEY;
    expect(new R2StorageProvider().isConfigured()).toBe(false);
  });

  it("is not configured when R2_BUCKET_NAME is missing", () => {
    setFullConfig();
    delete process.env.R2_BUCKET_NAME;
    expect(new R2StorageProvider().isConfigured()).toBe(false);
  });

  it("is configured when all required vars are present via R2_ACCOUNT_ID", () => {
    setFullConfig();
    expect(new R2StorageProvider().isConfigured()).toBe(true);
  });

  it("is configured via an explicit R2_ENDPOINT even without R2_ACCOUNT_ID", () => {
    setFullConfig();
    delete process.env.R2_ACCOUNT_ID;
    process.env.R2_ENDPOINT = "https://custom.example.com";
    expect(new R2StorageProvider().isConfigured()).toBe(true);
  });

  it("falls back to the disabled-like config error when nothing is set", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    const provider = new R2StorageProvider();
    await expect(provider.uploadBuffer!("k", Buffer.from("x"), "image/png")).rejects.toThrow(StorageConfigError);
  });

  it("never includes the secret's actual value in the config error message", async () => {
    setFullConfig();
    delete process.env.R2_BUCKET_NAME; // still misconfigured -> throws, but secret was set
    const provider = new R2StorageProvider();
    let caught: unknown;
    try {
      await provider.uploadBuffer!("k", Buffer.from("x"), "image/png");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(StorageConfigError);
    expect((caught as Error).message).not.toContain("super-secret-value");
  });
});

describe("R2StorageProvider - client configuration", () => {
  it("constructs the S3 client with region 'auto' and the derived endpoint, no forcePathStyle", async () => {
    setFullConfig();
    sendMock.mockResolvedValue({});
    const provider = new R2StorageProvider();
    await provider.uploadBuffer!("k", Buffer.from("x"), "image/png");
    expect(capturedOptions.value).toEqual(
      expect.objectContaining({
        region: "auto",
        endpoint: "https://acct123.r2.cloudflarestorage.com",
        forcePathStyle: false,
        credentials: { accessKeyId: "test-access-key", secretAccessKey: "super-secret-value" },
      })
    );
  });

  it("ignores STORAGE_REGION - region is always 'auto' for R2", async () => {
    setFullConfig();
    process.env.STORAGE_REGION = "us-east-1";
    sendMock.mockResolvedValue({});
    const provider = new R2StorageProvider();
    await provider.uploadBuffer!("k", Buffer.from("x"), "image/png");
    expect((capturedOptions.value as { region: string }).region).toBe("auto");
  });

  it("prefers an explicit R2_ENDPOINT over the derived one", async () => {
    setFullConfig();
    process.env.R2_ENDPOINT = "https://custom-r2-endpoint.example.com";
    sendMock.mockResolvedValue({});
    const provider = new R2StorageProvider();
    await provider.uploadBuffer!("k", Buffer.from("x"), "image/png");
    expect((capturedOptions.value as { endpoint: string }).endpoint).toBe("https://custom-r2-endpoint.example.com");
  });

  it("is a singleton client across multiple operations", async () => {
    setFullConfig();
    sendMock.mockResolvedValue({});
    const provider = new R2StorageProvider();
    await provider.uploadBuffer!("k1", Buffer.from("x"), "image/png");
    await provider.uploadBuffer!("k2", Buffer.from("y"), "image/png");
    expect(constructorSpy).toHaveBeenCalledTimes(1);
  });

  it("never logs or exposes credentials via console/error output", async () => {
    setFullConfig();
    sendMock.mockResolvedValue({});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const provider = new R2StorageProvider();
    await provider.uploadBuffer!("k", Buffer.from("x"), "image/png");
    for (const call of errorSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("super-secret-value");
    }
    errorSpy.mockRestore();
  });
});

describe("R2StorageProvider - object operations", () => {
  it("verifyUpload returns real size/contentType from a HEAD response", async () => {
    setFullConfig();
    sendMock.mockResolvedValue({ ContentLength: 4096, ContentType: "application/pdf" });
    const provider = new R2StorageProvider();
    const result = await provider.verifyUpload({ objectKey: "organizations/org1/leads/l1/documents/x.pdf" });
    expect(result.sizeBytes).toBe(4096);
    expect(result.contentType).toBe("application/pdf");
  });

  it("verifyUpload propagates a rejection for a missing object", async () => {
    setFullConfig();
    sendMock.mockRejectedValue(new Error("NotFound"));
    const provider = new R2StorageProvider();
    await expect(provider.verifyUpload({ objectKey: "missing.pdf" })).rejects.toThrow("NotFound");
  });

  it("createUploadAuthorization returns a presigned PUT with the R2 default TTL", async () => {
    setFullConfig();
    const provider = new R2StorageProvider();
    const auth = await provider.createUploadAuthorization({ objectKey: "k", mimeType: "image/jpeg", maxSizeBytes: 1000 });
    expect(auth.method).toBe("PUT");
    expect(auth.uploadUrl).toBe("https://signed.example/should-never-be-logged");
    expect(auth.expiresInSeconds).toBe(300);
  });

  it("createDownloadAuthorization respects R2_SIGNED_URL_EXPIRY_SECONDS as the default", async () => {
    setFullConfig();
    process.env.R2_SIGNED_URL_EXPIRY_SECONDS = "900";
    const provider = new R2StorageProvider();
    const auth = await provider.createDownloadAuthorization({ objectKey: "doc.pdf" });
    expect(auth.expiresInSeconds).toBe(900);
  });

  it("falls back to 300s when R2_SIGNED_URL_EXPIRY_SECONDS is invalid", async () => {
    setFullConfig();
    process.env.R2_SIGNED_URL_EXPIRY_SECONDS = "not-a-number";
    const provider = new R2StorageProvider();
    const auth = await provider.createDownloadAuthorization({ objectKey: "doc.pdf" });
    expect(auth.expiresInSeconds).toBe(300);
  });

  it("an explicit expiresInSeconds still overrides the configured default", async () => {
    setFullConfig();
    process.env.R2_SIGNED_URL_EXPIRY_SECONDS = "900";
    const provider = new R2StorageProvider();
    const auth = await provider.createDownloadAuthorization({ objectKey: "doc.pdf", expiresInSeconds: 120 });
    expect(auth.expiresInSeconds).toBe(120);
  });

  it("deleteObject sends a DeleteObjectCommand for the exact key", async () => {
    setFullConfig();
    sendMock.mockResolvedValue({});
    const provider = new R2StorageProvider();
    await provider.deleteObject("organizations/org1/properties/p1/images/x.jpg");
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ Key: "organizations/org1/properties/p1/images/x.jpg", Bucket: "test-bucket" }) }));
  });

  it("getMetadata propagates failure rather than swallowing it", async () => {
    setFullConfig();
    sendMock.mockRejectedValue(new Error("access denied"));
    const provider = new R2StorageProvider();
    await expect(provider.getMetadata("k")).rejects.toThrow("access denied");
  });
});

describe("R2StorageProvider - checkHealth", () => {
  it("reports not_configured with no credential/bucket internals leaked", async () => {
    for (const key of ENV_KEYS) delete process.env[key];
    const provider = new R2StorageProvider();
    const result = await provider.checkHealth();
    expect(result.status).toBe("not_configured");
    expect(result.detail).not.toMatch(/super-secret|access-key/i);
  });

  it("reports ok with the bucket name but no credentials, once configured", async () => {
    setFullConfig();
    const provider = new R2StorageProvider();
    const result = await provider.checkHealth();
    expect(result.status).toBe("ok");
    expect(result.detail).toContain("test-bucket");
    expect(result.detail).not.toContain("test-access-key");
    expect(result.detail).not.toContain("super-secret-value");
  });
});
