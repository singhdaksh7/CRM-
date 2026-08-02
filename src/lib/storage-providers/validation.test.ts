import { describe, it, expect } from "vitest";
import { assertFileAllowed, detectMimeFromMagicBytes, assertMagicBytesMatch, MAX_PROPERTY_IMAGE_BYTES, MAX_DOCUMENT_BYTES } from "./validation";
import { StorageValidationError } from "./types";

const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const PDF_BYTES = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const WEBP_BYTES = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]); // RIFF....WEBP

describe("assertFileAllowed - valid files", () => {
  it("accepts a valid JPEG property image", () => {
    expect(() => assertFileAllowed({ category: "PROPERTY_IMAGE", fileName: "cover.jpg", mimeType: "image/jpeg", sizeBytes: 1024 })).not.toThrow();
  });
  it("accepts a valid PNG property image", () => {
    expect(() => assertFileAllowed({ category: "PROPERTY_IMAGE", fileName: "cover.png", mimeType: "image/png", sizeBytes: 1024 })).not.toThrow();
  });
  it("accepts a valid WebP property image", () => {
    expect(() => assertFileAllowed({ category: "PROPERTY_IMAGE", fileName: "cover.webp", mimeType: "image/webp", sizeBytes: 1024 })).not.toThrow();
  });
  it("accepts a valid PDF document", () => {
    expect(() => assertFileAllowed({ category: "DOCUMENT", fileName: "agreement.pdf", mimeType: "application/pdf", sizeBytes: 1024 })).not.toThrow();
  });
});

describe("assertFileAllowed - size limits", () => {
  it("rejects an oversized property image", () => {
    expect(() => assertFileAllowed({ category: "PROPERTY_IMAGE", fileName: "big.jpg", mimeType: "image/jpeg", sizeBytes: MAX_PROPERTY_IMAGE_BYTES + 1 })).toThrow(StorageValidationError);
  });
  it("rejects an oversized document", () => {
    expect(() => assertFileAllowed({ category: "DOCUMENT", fileName: "big.pdf", mimeType: "application/pdf", sizeBytes: MAX_DOCUMENT_BYTES + 1 })).toThrow(StorageValidationError);
  });
  it("rejects an empty file", () => {
    expect(() => assertFileAllowed({ category: "DOCUMENT", fileName: "empty.pdf", mimeType: "application/pdf", sizeBytes: 0 })).toThrow(StorageValidationError);
  });
  it("accepts a document exactly at the size limit", () => {
    expect(() => assertFileAllowed({ category: "DOCUMENT", fileName: "max.pdf", mimeType: "application/pdf", sizeBytes: MAX_DOCUMENT_BYTES })).not.toThrow();
  });
});

describe("assertFileAllowed - MIME and extension checks", () => {
  it("rejects an invalid MIME type for the category", () => {
    expect(() => assertFileAllowed({ category: "PROPERTY_IMAGE", fileName: "doc.pdf", mimeType: "application/pdf", sizeBytes: 100 })).toThrow(StorageValidationError);
  });
  it("rejects an extension/MIME mismatch", () => {
    expect(() => assertFileAllowed({ category: "PROPERTY_IMAGE", fileName: "photo.png", mimeType: "image/jpeg", sizeBytes: 100 })).toThrow(StorageValidationError);
  });
  it("rejects an executable extension", () => {
    expect(() => assertFileAllowed({ category: "DOCUMENT", fileName: "invoice.exe", mimeType: "application/pdf", sizeBytes: 100 })).toThrow(StorageValidationError);
  });
  it("rejects a double extension (resume.pdf.exe)", () => {
    expect(() => assertFileAllowed({ category: "DOCUMENT", fileName: "resume.pdf.exe", mimeType: "application/pdf", sizeBytes: 100 })).toThrow(StorageValidationError);
  });
  it("rejects a double extension disguising an html payload (photo.jpg.html)", () => {
    expect(() => assertFileAllowed({ category: "PROPERTY_IMAGE", fileName: "photo.jpg.html", mimeType: "image/jpeg", sizeBytes: 100 })).toThrow(StorageValidationError);
  });
  it("rejects an unrecognized extension", () => {
    expect(() => assertFileAllowed({ category: "DOCUMENT", fileName: "file.xyz", mimeType: "application/pdf", sizeBytes: 100 })).toThrow(StorageValidationError);
  });
  it("rejects a file with no extension at all", () => {
    expect(() => assertFileAllowed({ category: "DOCUMENT", fileName: "noext", mimeType: "application/pdf", sizeBytes: 100 })).toThrow(StorageValidationError);
  });
  it("rejects an SVG (unsanitized SVG can carry script payloads)", () => {
    expect(() => assertFileAllowed({ category: "PROPERTY_IMAGE", fileName: "icon.svg", mimeType: "image/svg+xml", sizeBytes: 100 })).toThrow(StorageValidationError);
  });
  it("rejects an archive extension", () => {
    expect(() => assertFileAllowed({ category: "DOCUMENT", fileName: "bundle.zip", mimeType: "application/pdf", sizeBytes: 100 })).toThrow(StorageValidationError);
  });
});

describe("detectMimeFromMagicBytes", () => {
  it("detects JPEG from its signature", () => {
    expect(detectMimeFromMagicBytes(JPEG_BYTES)).toBe("image/jpeg");
  });
  it("detects PNG from its signature", () => {
    expect(detectMimeFromMagicBytes(PNG_BYTES)).toBe("image/png");
  });
  it("detects PDF from its signature", () => {
    expect(detectMimeFromMagicBytes(PDF_BYTES)).toBe("application/pdf");
  });
  it("detects WebP from its RIFF/WEBP markers", () => {
    expect(detectMimeFromMagicBytes(WEBP_BYTES)).toBe("image/webp");
  });
  it("returns null for an unrecognized signature", () => {
    expect(detectMimeFromMagicBytes(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
  });
});

describe("assertMagicBytesMatch", () => {
  it("passes when the declared type matches the actual signature", () => {
    expect(() => assertMagicBytesMatch("image/jpeg", JPEG_BYTES)).not.toThrow();
  });
  it("throws when the declared type does not match the actual signature (spoofed MIME)", () => {
    expect(() => assertMagicBytesMatch("application/pdf", JPEG_BYTES)).toThrow(StorageValidationError);
  });
  it("throws when the signature is unrecognized", () => {
    expect(() => assertMagicBytesMatch("image/jpeg", Uint8Array.from([0, 0, 0, 0]))).toThrow(StorageValidationError);
  });
});
