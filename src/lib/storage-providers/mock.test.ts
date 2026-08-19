import { describe, it, expect, beforeEach } from "vitest";
import { MockStorageProvider } from "./mock";

describe("MockStorageProvider", () => {
  let provider: MockStorageProvider;

  beforeEach(() => {
    provider = new MockStorageProvider();
    provider.clear();
  });

  it("round-trips uploadBuffer + verify + download + delete without network", async () => {
    const key = "organizations/org_default/properties/p1/images/a.webp";
    await provider.uploadBuffer(key, Buffer.from("hello"), "image/webp");
    const verified = await provider.verifyUpload({ objectKey: key });
    expect(verified.sizeBytes).toBe(5);
    expect(await provider.exists(key)).toBe(true);
    const dl = await provider.createDownloadAuthorization({ objectKey: key, contentDisposition: 'inline; filename="a.webp"' });
    expect(dl.url).toContain("mock://download/");
    expect(dl.url).toContain("disposition=");
    await provider.deleteObject(key);
    expect(await provider.exists(key)).toBe(false);
  });

  it("createUploadAuthorization returns PUT method with mock URL", async () => {
    const auth = await provider.createUploadAuthorization({
      objectKey: "organizations/org_default/properties/p1/images/b.webp",
      mimeType: "image/webp",
      maxSizeBytes: 1000,
    });
    expect(auth.method).toBe("PUT");
    expect(auth.uploadUrl).toMatch(/^mock:\/\/upload\//);
  });

  it("checkHealth reports ok", async () => {
    const health = await provider.checkHealth();
    expect(health.status).toBe("ok");
  });
});
