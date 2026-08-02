import { describe, it, expect, vi, beforeEach } from "vitest";

const documentCreate = vi.fn();
const documentFindFirst = vi.fn();
const documentUpdate = vi.fn();
const propertyFindFirst = vi.fn();
const leadFindFirst = vi.fn();
const ownerFindFirst = vi.fn();
const dealFindFirst = vi.fn();
const paymentFindFirst = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    document: { create: (...a: unknown[]) => documentCreate(...a), findFirst: (...a: unknown[]) => documentFindFirst(...a), update: (...a: unknown[]) => documentUpdate(...a) },
    property: { findFirst: (...a: unknown[]) => propertyFindFirst(...a) },
    lead: { findFirst: (...a: unknown[]) => leadFindFirst(...a) },
    owner: { findFirst: (...a: unknown[]) => ownerFindFirst(...a) },
    deal: { findFirst: (...a: unknown[]) => dealFindFirst(...a) },
    payment: { findFirst: (...a: unknown[]) => paymentFindFirst(...a) },
  },
}));

const recordAudit = vi.fn();
vi.mock("./audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));

// api-auth.ts imports NextAuth (via ./auth) at module scope, which pulls in
// next/server in a way the plain vitest/node environment can't resolve -
// only ApiError (a plain class, no NextAuth dependency) is actually needed here.
vi.mock("./api-auth", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

const uploadFileBuffer = vi.fn();
const verifyUploadedObject = vi.fn();
vi.mock("./storage", async () => {
  const actual = await vi.importActual<typeof import("./storage")>("./storage");
  return {
    ...actual,
    uploadFileBuffer: (...a: unknown[]) => uploadFileBuffer(...a),
    verifyUploadedObject: (...a: unknown[]) => verifyUploadedObject(...a),
    activeStorageProviderName: () => "FIREBASE",
  };
});

const { uploadDocument, assertDocumentEntityExists } = await import("./documents");
const { ApiError } = await import("./api-auth");

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0]);
const PDF_BYTES = Buffer.from("%PDF-1.4 fake pdf content for tests");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("assertDocumentEntityExists", () => {
  it("passes when the linked entity exists in the organization", async () => {
    propertyFindFirst.mockResolvedValue({ id: "prop1" });
    await expect(assertDocumentEntityExists("PROPERTY", "prop1", "org_default")).resolves.toBeUndefined();
  });

  it("throws 404 when the linked entity does not exist (or belongs to a different org)", async () => {
    propertyFindFirst.mockResolvedValue(null);
    await expect(assertDocumentEntityExists("PROPERTY", "cross-org-prop", "org_default")).rejects.toThrow(ApiError);
  });
});

describe("uploadDocument - permissions", () => {
  it("Admin can upload an AADHAAR document", async () => {
    propertyFindFirst.mockResolvedValue({ id: "prop1" });
    leadFindFirst.mockResolvedValue({ id: "lead1" });
    uploadFileBuffer.mockResolvedValue({ objectKey: "k", sizeBytes: JPEG_BYTES.byteLength, contentType: "image/jpeg" });
    documentCreate.mockResolvedValue({ id: "doc1", storageProvider: "FIREBASE" });

    const doc = await uploadDocument({
      actorId: "admin1", role: "ADMIN", entityType: "LEAD", entityId: "lead1",
      fileName: "aadhaar.jpg", mimeType: "image/jpeg", buffer: JPEG_BYTES, category: "AADHAAR",
    });
    expect(doc.id).toBe("doc1");
    expect(uploadFileBuffer).toHaveBeenCalled();
  });

  it("Field Executive upload of an AADHAAR document is denied before touching storage or the database", async () => {
    await expect(
      uploadDocument({
        actorId: "fe1", role: "FIELD_EXECUTIVE", entityType: "LEAD", entityId: "lead1",
        fileName: "aadhaar.jpg", mimeType: "image/jpeg", buffer: JPEG_BYTES, category: "AADHAAR",
      })
    ).rejects.toThrow(ApiError);
    expect(uploadFileBuffer).not.toHaveBeenCalled();
    expect(documentCreate).not.toHaveBeenCalled();
    expect(leadFindFirst).not.toHaveBeenCalled(); // entity check never even runs - permission is checked first
  });

  it("Field Executive can upload a GENERAL document", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead1" });
    uploadFileBuffer.mockResolvedValue({ objectKey: "k", sizeBytes: PDF_BYTES.byteLength, contentType: "application/pdf" });
    documentCreate.mockResolvedValue({ id: "doc2", storageProvider: "FIREBASE" });

    const doc = await uploadDocument({
      actorId: "fe1", role: "FIELD_EXECUTIVE", entityType: "LEAD", entityId: "lead1",
      fileName: "note.pdf", mimeType: "application/pdf", buffer: PDF_BYTES, category: "GENERAL",
    });
    expect(doc.id).toBe("doc2");
  });
});

describe("uploadDocument - entity validation", () => {
  it("rejects an unrelated/nonexistent entity id (cross-organization or invalid link)", async () => {
    leadFindFirst.mockResolvedValue(null);
    await expect(
      uploadDocument({
        actorId: "admin1", role: "ADMIN", entityType: "LEAD", entityId: "does-not-exist",
        fileName: "note.pdf", mimeType: "application/pdf", buffer: PDF_BYTES,
      })
    ).rejects.toThrow(ApiError);
    expect(uploadFileBuffer).not.toHaveBeenCalled();
  });
});

describe("uploadDocument - upload verification", () => {
  it("rejects a file whose signature doesn't match its declared MIME type, before any upload", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead1" });
    const notActuallyAPdf = Buffer.from("this is not a pdf");
    await expect(
      uploadDocument({
        actorId: "admin1", role: "ADMIN", entityType: "LEAD", entityId: "lead1",
        fileName: "fake.pdf", mimeType: "application/pdf", buffer: notActuallyAPdf,
      })
    ).rejects.toThrow(ApiError);
    expect(uploadFileBuffer).not.toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ newValues: expect.objectContaining({ event: "upload_verification_failed" }) }));
  });

  it("rejects an oversized file before any upload", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead1" });
    const oversized = Buffer.concat([PDF_BYTES, Buffer.alloc(26 * 1024 * 1024)]);
    await expect(
      uploadDocument({
        actorId: "admin1", role: "ADMIN", entityType: "LEAD", entityId: "lead1",
        fileName: "huge.pdf", mimeType: "application/pdf", buffer: oversized,
      })
    ).rejects.toThrow(ApiError);
    expect(uploadFileBuffer).not.toHaveBeenCalled();
  });
});

describe("uploadDocument - success + audit", () => {
  it("creates the Document record with GENERAL default category and records an upload_completed audit event", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead1" });
    uploadFileBuffer.mockResolvedValue({ objectKey: "organizations/org_default/leads/lead1/documents/x.pdf", sizeBytes: PDF_BYTES.byteLength, contentType: "application/pdf" });
    documentCreate.mockResolvedValue({ id: "doc3", storageProvider: "FIREBASE", category: "GENERAL" });

    const doc = await uploadDocument({
      actorId: "admin1", role: "ADMIN", entityType: "LEAD", entityId: "lead1",
      fileName: "note.pdf", mimeType: "application/pdf", buffer: PDF_BYTES,
    });

    expect(doc.id).toBe("doc3");
    expect(documentCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ leadId: "lead1", category: "GENERAL", storageProvider: "FIREBASE" }) })
    );
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ newValues: expect.objectContaining({ event: "upload_completed" }) }));
  });
});
