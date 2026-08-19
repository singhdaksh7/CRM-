import { describe, it, expect } from "vitest";
import { getStorageReadiness } from "./storage";
import { _resetStorageProviderCacheForTests } from "./storage-providers";
import { sanitizeOriginalFilename, buildContentDisposition } from "./image-optimize";
import { buildPropertyImageObjectKey } from "./storage-providers/object-key";
import { assertFileAllowed } from "./storage-providers/validation";
import { StorageValidationError } from "./storage-providers/types";

describe("storage readiness (no probe upload)", () => {
  it("reports not configured without calling a provider when DISABLED", async () => {
    const saved = process.env.STORAGE_PROVIDER;
    delete process.env.STORAGE_PROVIDER;
    _resetStorageProviderCacheForTests();
    const readiness = await getStorageReadiness();
    expect(readiness.configured).toBe(false);
    expect(readiness.uploadCapability).toBe(false);
    expect(readiness.provider).toBe("DISABLED");
    if (saved === undefined) delete process.env.STORAGE_PROVIDER;
    else process.env.STORAGE_PROVIDER = saved;
    _resetStorageProviderCacheForTests();
  });

  it("MOCK readiness is configured with capabilities", async () => {
    const saved = process.env.STORAGE_PROVIDER;
    process.env.STORAGE_PROVIDER = "MOCK";
    _resetStorageProviderCacheForTests();
    const readiness = await getStorageReadiness();
    expect(readiness.configured).toBe(true);
    expect(readiness.uploadCapability).toBe(true);
    expect(readiness.readCapability).toBe(true);
    expect(readiness.deleteCapability).toBe(true);
    if (saved === undefined) delete process.env.STORAGE_PROVIDER;
    else process.env.STORAGE_PROVIDER = saved;
    _resetStorageProviderCacheForTests();
  });
});

describe("filename + key safety", () => {
  it("sanitizes path separators and formula prefixes", () => {
    expect(sanitizeOriginalFilename("=cmd|'/C calc'!A0.jpg")).toMatch(/^_/);
    expect(sanitizeOriginalFilename("../secret.webp")).not.toContain("..");
    expect(sanitizeOriginalFilename("a/b\\c.png")).not.toMatch(/[\\/]/);
  });

  it("builds content-disposition safely", () => {
    expect(buildContentDisposition('evil"name.pdf', false)).toContain("attachment");
    expect(buildContentDisposition('evil"name.pdf', false)).not.toContain('"name');
  });

  it("rejects path traversal in property ids", () => {
    expect(() =>
      buildPropertyImageObjectKey({ organizationId: "org_default", propertyId: "../x", fileName: "a.webp", purpose: "IMAGE" })
    ).toThrow(StorageValidationError);
  });
});

describe("document / image validation policy", () => {
  it("rejects SVG and executables for property images", () => {
    expect(() => assertFileAllowed({ category: "PROPERTY_IMAGE", fileName: "x.svg", mimeType: "image/svg+xml", sizeBytes: 10 })).toThrow();
    expect(() => assertFileAllowed({ category: "PROPERTY_IMAGE", fileName: "x.exe", mimeType: "image/jpeg", sizeBytes: 10 })).toThrow();
  });

  it("rejects executables for documents", () => {
    expect(() => assertFileAllowed({ category: "DOCUMENT", fileName: "pay.exe", mimeType: "application/pdf", sizeBytes: 10 })).toThrow();
  });

  it("allows PDF documents and webp images", () => {
    expect(() => assertFileAllowed({ category: "DOCUMENT", fileName: "brochure.pdf", mimeType: "application/pdf", sizeBytes: 100 })).not.toThrow();
    expect(() => assertFileAllowed({ category: "PROPERTY_IMAGE", fileName: "a.webp", mimeType: "image/webp", sizeBytes: 100 })).not.toThrow();
  });
});

describe("no NEXT_PUBLIC storage secrets", () => {
  it("does not expose R2/Firebase secret env names as NEXT_PUBLIC_", () => {
    const secretKeys = ["R2_SECRET_ACCESS_KEY", "R2_ACCESS_KEY_ID", "FIREBASE_PRIVATE_KEY", "STORAGE_SECRET_ACCESS_KEY"];
    for (const key of secretKeys) {
      expect(process.env[`NEXT_PUBLIC_${key}`]).toBeUndefined();
    }
  });
});
