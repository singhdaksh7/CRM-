import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFile = {
  save: vi.fn(),
  exists: vi.fn(),
  getMetadata: vi.fn(),
  getSignedUrl: vi.fn(),
  delete: vi.fn(),
};
const mockBucket = {
  file: vi.fn(() => mockFile),
  exists: vi.fn(),
};
const mockStorage = { bucket: vi.fn(() => mockBucket) };

vi.mock("../firebase-admin", () => ({
  getFirebaseStorage: () => mockStorage,
  getFirebaseBucketName: () => "test-bucket.appspot.com",
  isFirebaseConfigured: () => true,
}));

const { FirebaseStorageProvider } = await import("./firebase");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FirebaseStorageProvider", () => {
  it("createUploadAuthorization returns SERVER_MEDIATED with no uploadUrl", async () => {
    const provider = new FirebaseStorageProvider();
    const auth = await provider.createUploadAuthorization({ objectKey: "organizations/org1/properties/p1/images/x.jpg", mimeType: "image/jpeg", maxSizeBytes: 1000 });
    expect(auth.method).toBe("SERVER_MEDIATED");
    expect(auth.uploadUrl).toBeUndefined();
    expect(auth.objectKey).toBe("organizations/org1/properties/p1/images/x.jpg");
  });

  it("uploadBuffer saves the buffer with the declared content type", async () => {
    const provider = new FirebaseStorageProvider();
    const buffer = Buffer.from("fake-image-bytes");
    const result = await provider.uploadBuffer!("organizations/org1/properties/p1/images/x.jpg", buffer, "image/jpeg");
    expect(mockFile.save).toHaveBeenCalledWith(buffer, expect.objectContaining({ contentType: "image/jpeg" }));
    expect(result.sizeBytes).toBe(buffer.byteLength);
  });

  it("verifyUpload throws when the object does not exist", async () => {
    mockFile.exists.mockResolvedValue([false]);
    const provider = new FirebaseStorageProvider();
    await expect(provider.verifyUpload({ objectKey: "missing.jpg" })).rejects.toThrow(/not found/i);
  });

  it("verifyUpload returns real size/contentType when the object exists", async () => {
    mockFile.exists.mockResolvedValue([true]);
    mockFile.getMetadata.mockResolvedValue([{ size: "2048", contentType: "image/jpeg" }]);
    const provider = new FirebaseStorageProvider();
    const result = await provider.verifyUpload({ objectKey: "present.jpg" });
    expect(result.sizeBytes).toBe(2048);
    expect(result.contentType).toBe("image/jpeg");
  });

  it("createDownloadAuthorization returns a short-lived signed URL, defaulting to 5 minutes", async () => {
    mockFile.getSignedUrl.mockResolvedValue(["https://signed.example/url"]);
    const provider = new FirebaseStorageProvider();
    const auth = await provider.createDownloadAuthorization({ objectKey: "doc.pdf" });
    expect(auth.url).toBe("https://signed.example/url");
    expect(auth.expiresInSeconds).toBe(300);
    expect(mockFile.getSignedUrl).toHaveBeenCalledWith(expect.objectContaining({ action: "read" }));
  });

  it("createDownloadAuthorization respects a custom expiry", async () => {
    mockFile.getSignedUrl.mockResolvedValue(["https://signed.example/url"]);
    const provider = new FirebaseStorageProvider();
    const auth = await provider.createDownloadAuthorization({ objectKey: "doc.pdf", expiresInSeconds: 900 });
    expect(auth.expiresInSeconds).toBe(900);
  });

  it("deleteObject ignores a not-found object rather than throwing", async () => {
    const provider = new FirebaseStorageProvider();
    await provider.deleteObject("already-gone.pdf");
    expect(mockFile.delete).toHaveBeenCalledWith({ ignoreNotFound: true });
  });

  it("checkHealth reports ok when the bucket exists", async () => {
    mockBucket.exists.mockResolvedValue([true]);
    const provider = new FirebaseStorageProvider();
    const result = await provider.checkHealth();
    expect(result.status).toBe("ok");
  });

  it("checkHealth reports error when the bucket doesn't exist", async () => {
    mockBucket.exists.mockResolvedValue([false]);
    const provider = new FirebaseStorageProvider();
    const result = await provider.checkHealth();
    expect(result.status).toBe("error");
  });

  it("checkHealth reports error (not a throw) when the bucket check itself fails", async () => {
    mockBucket.exists.mockRejectedValue(new Error("permission denied"));
    const provider = new FirebaseStorageProvider();
    const result = await provider.checkHealth();
    expect(result.status).toBe("error");
    expect(result.detail).toMatch(/permission denied/);
  });
});
