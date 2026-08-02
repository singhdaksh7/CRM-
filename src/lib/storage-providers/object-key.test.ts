import { describe, it, expect } from "vitest";
import { buildDocumentObjectKey, buildPropertyImageObjectKey, buildObjectKey, sanitizeExtension } from "./object-key";
import { StorageValidationError } from "./types";

describe("buildDocumentObjectKey", () => {
  it("builds an organization-isolated key for a property document", () => {
    const key = buildDocumentObjectKey({ organizationId: "org_default", entityType: "PROPERTY", entityId: "prop123", fileName: "registry.pdf" });
    expect(key).toMatch(/^organizations\/org_default\/properties\/prop123\/documents\/[0-9a-f-]{36}\.pdf$/);
  });

  it("builds an owner document key", () => {
    const key = buildDocumentObjectKey({ organizationId: "org_default", entityType: "OWNER", entityId: "own1", fileName: "aadhaar.jpg" });
    expect(key).toMatch(/^organizations\/org_default\/owners\/own1\/documents\/[0-9a-f-]{36}\.jpg$/);
  });

  it("builds a deal document key", () => {
    const key = buildDocumentObjectKey({ organizationId: "org_default", entityType: "DEAL", entityId: "deal1", fileName: "agreement.pdf" });
    expect(key).toMatch(/^organizations\/org_default\/deals\/deal1\/documents\/[0-9a-f-]{36}\.pdf$/);
  });

  it("builds a payment receipt key under a distinct 'receipts' segment", () => {
    const key = buildDocumentObjectKey({ organizationId: "org_default", entityType: "PAYMENT", entityId: "pay1", fileName: "receipt.pdf" });
    expect(key).toMatch(/^organizations\/org_default\/payments\/pay1\/receipts\/[0-9a-f-]{36}\.pdf$/);
  });

  it("isolates different organizations into different key prefixes for the same entity id", () => {
    const keyA = buildDocumentObjectKey({ organizationId: "org_a", entityType: "LEAD", entityId: "lead1", fileName: "f.pdf" });
    const keyB = buildDocumentObjectKey({ organizationId: "org_b", entityType: "LEAD", entityId: "lead1", fileName: "f.pdf" });
    expect(keyA.startsWith("organizations/org_a/")).toBe(true);
    expect(keyB.startsWith("organizations/org_b/")).toBe(true);
    expect(keyA).not.toBe(keyB);
  });

  it("never includes the original file name in the key", () => {
    const key = buildDocumentObjectKey({ organizationId: "org_default", entityType: "OWNER", entityId: "own1", fileName: "rajesh-kumar-aadhaar-card.jpg" });
    expect(key).not.toMatch(/rajesh/i);
    expect(key).not.toMatch(/kumar/i);
    expect(key).not.toMatch(/aadhaar/i);
  });

  it("generates a different UUID on every call, even for identical inputs", () => {
    const params = { organizationId: "org_default", entityType: "LEAD" as const, entityId: "lead1", fileName: "note.pdf" };
    const keyA = buildDocumentObjectKey(params);
    const keyB = buildDocumentObjectKey(params);
    expect(keyA).not.toBe(keyB);
  });

  it("rejects an invalid (path-traversal-shaped) organization id", () => {
    expect(() => buildDocumentObjectKey({ organizationId: "../../etc", entityType: "PROPERTY", entityId: "p1", fileName: "f.pdf" })).toThrow(StorageValidationError);
  });

  it("rejects an invalid entity id containing a path separator", () => {
    expect(() => buildDocumentObjectKey({ organizationId: "org_default", entityType: "PROPERTY", entityId: "p1/../../secrets", fileName: "f.pdf" })).toThrow(StorageValidationError);
  });

  it("rejects a file name with no extension", () => {
    expect(() => buildDocumentObjectKey({ organizationId: "org_default", entityType: "PROPERTY", entityId: "p1", fileName: "noextension" })).toThrow(StorageValidationError);
  });

  it("rejects a file name containing path traversal", () => {
    expect(() => buildDocumentObjectKey({ organizationId: "org_default", entityType: "PROPERTY", entityId: "p1", fileName: "../../etc/passwd.pdf" })).toThrow(StorageValidationError);
  });

  it("rejects a file name with an unsafe extension character", () => {
    expect(() => buildDocumentObjectKey({ organizationId: "org_default", entityType: "PROPERTY", entityId: "p1", fileName: "file.p!f" })).toThrow(StorageValidationError);
  });
});

describe("buildPropertyImageObjectKey", () => {
  it("builds an images-segment key by default", () => {
    const key = buildPropertyImageObjectKey({ organizationId: "org_default", propertyId: "prop1", fileName: "cover.jpg", purpose: "IMAGE" });
    expect(key).toMatch(/^organizations\/org_default\/properties\/prop1\/images\/[0-9a-f-]{36}\.jpg$/);
  });

  it("builds a floor-plans-segment key for FLOOR_PLAN purpose", () => {
    const key = buildPropertyImageObjectKey({ organizationId: "org_default", propertyId: "prop1", fileName: "plan.png", purpose: "FLOOR_PLAN" });
    expect(key).toMatch(/^organizations\/org_default\/properties\/prop1\/floor-plans\/[0-9a-f-]{36}\.png$/);
  });

  it("rejects path traversal in the property id", () => {
    expect(() => buildPropertyImageObjectKey({ organizationId: "org_default", propertyId: "../secrets", fileName: "a.jpg", purpose: "IMAGE" })).toThrow(StorageValidationError);
  });
});

describe("buildObjectKey (legacy signature)", () => {
  it("produces the same safe shape as buildDocumentObjectKey", () => {
    const key = buildObjectKey({ organizationId: "org_default", entityType: "LEAD", entityId: "lead1", fileName: "note.pdf" });
    expect(key).toMatch(/^organizations\/org_default\/leads\/lead1\/documents\/[0-9a-f-]{36}\.pdf$/);
  });
});

describe("sanitizeExtension", () => {
  it("extracts a lowercase extension", () => {
    expect(sanitizeExtension("Photo.JPG")).toBe("jpg");
  });

  it("rejects a null byte in the file name", () => {
    expect(() => sanitizeExtension("evil\0.pdf")).toThrow(StorageValidationError);
  });

  it("rejects an empty file name", () => {
    expect(() => sanitizeExtension("")).toThrow(StorageValidationError);
  });
});
