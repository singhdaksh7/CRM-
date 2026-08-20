import { describe, it, expect, vi, beforeEach } from "vitest";

const propertyImageCreate = vi.fn();
const propertyImageFindFirst = vi.fn();
const propertyImageFindMany = vi.fn();
const propertyImageUpdate = vi.fn();
const propertyImageUpdateMany = vi.fn();
const propertyImageAggregate = vi.fn();
const propertyImageCount = vi.fn();
const propertyFindFirst = vi.fn();
const transactionMock = vi.fn(async (arg: unknown) => {
  if (typeof arg === "function") {
    const tx = {
      propertyImage: {
        create: (...a: unknown[]) => propertyImageCreate(...a),
        findFirst: (...a: unknown[]) => propertyImageFindFirst(...a),
        update: (...a: unknown[]) => propertyImageUpdate(...a),
        updateMany: (...a: unknown[]) => propertyImageUpdateMany(...a),
      },
    };
    return (arg as (tx: unknown) => Promise<unknown>)(tx);
  }
  return Promise.all(arg as Promise<unknown>[]);
});

vi.mock("./prisma", () => ({
  prisma: {
    propertyImage: {
      create: (...a: unknown[]) => propertyImageCreate(...a),
      findFirst: (...a: unknown[]) => propertyImageFindFirst(...a),
      findMany: (...a: unknown[]) => propertyImageFindMany(...a),
      update: (...a: unknown[]) => propertyImageUpdate(...a),
      updateMany: (...a: unknown[]) => propertyImageUpdateMany(...a),
      aggregate: (...a: unknown[]) => propertyImageAggregate(...a),
      count: (...a: unknown[]) => propertyImageCount(...a),
    },
    property: { findFirst: (...a: unknown[]) => propertyFindFirst(...a) },
    $transaction: (...a: [unknown]) => transactionMock(...a),
  },
}));

const recordAudit = vi.fn();
vi.mock("./audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));

// See documents.test.ts - api-auth.ts pulls in NextAuth at module scope,
// which the plain vitest/node environment can't resolve; only the plain
// ApiError class is actually needed here.
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
const deleteObjectMock = vi.fn();
const createDownloadUrlMock = vi.fn(async (key: string) => `https://signed.example/${key}`);
vi.mock("./storage", async () => {
  const actual = await vi.importActual<typeof import("./storage")>("./storage");
  return {
    ...actual,
    uploadFileBuffer: (...a: unknown[]) => uploadFileBuffer(...a),
    deleteObject: (...a: unknown[]) => deleteObjectMock(...a),
    createDownloadUrl: (...a: [string]) => createDownloadUrlMock(...a),
    activeStorageProviderName: () => "FIREBASE",
  };
});

const { uploadPropertyImage, softDeletePropertyImage, physicalDeletePropertyImage, replacePropertyImage, updatePropertyImage, reorderPropertyImages, getCoverImageUrls } = await import("./property-images");
const { ApiError } = await import("./api-auth");

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0]);

beforeEach(() => {
  vi.clearAllMocks();
  propertyImageAggregate.mockResolvedValue({ _max: { sortOrder: null } });
  propertyImageCount.mockResolvedValue(0);
});

describe("uploadPropertyImage - permissions", () => {
  it("Admin can upload a floor plan", async () => {
    propertyFindFirst.mockResolvedValue({ id: "prop1" });
    uploadFileBuffer.mockResolvedValue({ objectKey: "k", sizeBytes: JPEG_BYTES.byteLength, contentType: "image/jpeg" });
    propertyImageCreate.mockResolvedValue({ id: "img1", isCover: false });

    const image = await uploadPropertyImage({ actorId: "admin1", organizationId: "org_default", role: "ADMIN", propertyId: "prop1", fileName: "plan.jpg", mimeType: "image/jpeg", buffer: JPEG_BYTES, purpose: "FLOOR_PLAN" });
    expect(image.id).toBe("img1");
  });

  it("Field Executive can upload a listing IMAGE (e.g. from a property visit)", async () => {
    propertyFindFirst.mockResolvedValue({ id: "prop1" });
    uploadFileBuffer.mockResolvedValue({ objectKey: "k", sizeBytes: JPEG_BYTES.byteLength, contentType: "image/jpeg" });
    propertyImageCreate.mockResolvedValue({ id: "img2", isCover: false });

    const image = await uploadPropertyImage({ actorId: "fe1", organizationId: "org_default", role: "FIELD_EXECUTIVE", propertyId: "prop1", fileName: "visit.jpg", mimeType: "image/jpeg", buffer: JPEG_BYTES, purpose: "IMAGE" });
    expect(image.id).toBe("img2");
  });

  it("Field Executive is denied uploading a FLOOR_PLAN", async () => {
    await expect(
      uploadPropertyImage({ actorId: "fe1", organizationId: "org_default", role: "FIELD_EXECUTIVE", propertyId: "prop1", fileName: "plan.jpg", mimeType: "image/jpeg", buffer: JPEG_BYTES, purpose: "FLOOR_PLAN" })
    ).rejects.toThrow(ApiError);
    expect(uploadFileBuffer).not.toHaveBeenCalled();
    expect(propertyFindFirst).not.toHaveBeenCalled(); // permission denied before the entity check even runs
  });

  it("rejects upload to a property outside the actor's organization", async () => {
    propertyFindFirst.mockResolvedValue(null);
    await expect(
      uploadPropertyImage({ actorId: "admin1", organizationId: "org_default", role: "ADMIN", propertyId: "cross-org-prop", fileName: "x.jpg", mimeType: "image/jpeg", buffer: JPEG_BYTES })
    ).rejects.toThrow(ApiError);
    expect(uploadFileBuffer).not.toHaveBeenCalled();
  });
});

describe("uploadPropertyImage - cover image handling", () => {
  it("clears any existing cover flag before setting the new one", async () => {
    propertyFindFirst.mockResolvedValue({ id: "prop1" });
    uploadFileBuffer.mockResolvedValue({ objectKey: "k", sizeBytes: JPEG_BYTES.byteLength, contentType: "image/jpeg" });
    propertyImageCreate.mockResolvedValue({ id: "img3", isCover: true });

    await uploadPropertyImage({ actorId: "admin1", organizationId: "org_default", role: "ADMIN", propertyId: "prop1", fileName: "cover.jpg", mimeType: "image/jpeg", buffer: JPEG_BYTES, isCover: true });
    expect(propertyImageUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ propertyId: "prop1", isCover: true }), data: { isCover: false } }));
  });
});

describe("softDeletePropertyImage", () => {
  it("Admin can soft-delete", async () => {
    propertyImageFindFirst.mockResolvedValue({ id: "img1", propertyId: "prop1", isCover: false, storageKey: "k" });
    propertyImageUpdate.mockResolvedValue({ id: "img1", status: "DELETED" });
    const result = await softDeletePropertyImage({ imageId: "img1", actorId: "admin1", organizationId: "org_default", role: "ADMIN" });
    expect(result.status).toBe("DELETED");
  });

  it("Field Executive is denied", async () => {
    propertyImageFindFirst.mockResolvedValue({ id: "img1", propertyId: "prop1", isCover: false, storageKey: "k" });
    await expect(softDeletePropertyImage({ imageId: "img1", actorId: "fe1", organizationId: "org_default", role: "FIELD_EXECUTIVE" })).rejects.toThrow(ApiError);
    expect(propertyImageUpdate).not.toHaveBeenCalled();
  });

  it("throws 404 for a nonexistent image", async () => {
    propertyImageFindFirst.mockResolvedValue(null);
    await expect(softDeletePropertyImage({ imageId: "missing", actorId: "admin1", organizationId: "org_default", role: "ADMIN" })).rejects.toThrow(ApiError);
  });
});

describe("physicalDeletePropertyImage", () => {
  it("Admin-only", async () => {
    propertyImageFindFirst.mockResolvedValue({ id: "img1", storageKey: "k" });
    await physicalDeletePropertyImage({ imageId: "img1", actorId: "admin1", organizationId: "org_default", role: "ADMIN" });
    expect(deleteObjectMock).toHaveBeenCalledWith("k");
  });

  it("Data Manager is denied physical deletion", async () => {
    await expect(physicalDeletePropertyImage({ imageId: "img1", actorId: "dm1", organizationId: "org_default", role: "DATA_MANAGER" })).rejects.toThrow(ApiError);
    expect(deleteObjectMock).not.toHaveBeenCalled();
  });
});

describe("replacePropertyImage", () => {
  it("uploads and verifies the new image before soft-deleting the old one, and never touches the old physical object", async () => {
    propertyImageFindFirst.mockResolvedValue({ id: "old1", propertyId: "prop1", purpose: "IMAGE", caption: null, isCover: true, status: "ACTIVE", storageKey: "old-key" });
    propertyFindFirst.mockResolvedValue({ id: "prop1" });
    uploadFileBuffer.mockResolvedValue({ objectKey: "new-key", sizeBytes: JPEG_BYTES.byteLength, contentType: "image/jpeg" });
    propertyImageCreate.mockResolvedValue({ id: "new1", isCover: true });
    propertyImageUpdate.mockResolvedValue({ id: "old1", status: "DELETED" });

    const next = await replacePropertyImage({ imageId: "old1", actorId: "admin1", organizationId: "org_default", role: "ADMIN", fileName: "new.jpg", mimeType: "image/jpeg", buffer: JPEG_BYTES });

    expect(next.id).toBe("new1");
    expect(deleteObjectMock).not.toHaveBeenCalled(); // old physical object is left in place
    expect(propertyImageUpdate).toHaveBeenCalledWith({ where: { id: "old1" }, data: expect.objectContaining({ status: "DELETED" }) });
  });

  it("refuses to replace an already-deleted image", async () => {
    propertyImageFindFirst.mockResolvedValue({ id: "old1", status: "DELETED" });
    await expect(
      replacePropertyImage({ imageId: "old1", actorId: "admin1", organizationId: "org_default", role: "ADMIN", fileName: "new.jpg", mimeType: "image/jpeg", buffer: JPEG_BYTES })
    ).rejects.toThrow(ApiError);
    expect(uploadFileBuffer).not.toHaveBeenCalled();
  });

  it("a failed replacement (upload verification failure) never touches the original record", async () => {
    propertyImageFindFirst.mockResolvedValue({ id: "old1", propertyId: "prop1", purpose: "IMAGE", caption: null, isCover: false, status: "ACTIVE", storageKey: "old-key" });
    propertyFindFirst.mockResolvedValue({ id: "prop1" });
    const notActuallyAnImage = Buffer.from("not an image");

    await expect(
      replacePropertyImage({ imageId: "old1", actorId: "admin1", organizationId: "org_default", role: "ADMIN", fileName: "new.jpg", mimeType: "image/jpeg", buffer: notActuallyAnImage })
    ).rejects.toThrow();
    expect(propertyImageUpdate).not.toHaveBeenCalled();
    expect(uploadFileBuffer).not.toHaveBeenCalled();
  });
});

describe("updatePropertyImage", () => {
  it("Data Manager can set a caption and cover flag", async () => {
    propertyImageFindFirst.mockResolvedValue({ id: "img1", propertyId: "prop1", status: "ACTIVE", caption: null, isCover: false });
    propertyImageUpdate.mockResolvedValue({ id: "img1", caption: "Living room", isCover: true });

    const image = await updatePropertyImage({ imageId: "img1", actorId: "dm1", organizationId: "org_default", role: "DATA_MANAGER", caption: "Living room", isCover: true });
    expect(image.caption).toBe("Living room");
    expect(propertyImageUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ propertyId: "prop1", isCover: true }) }));
  });

  it("Field Executive is denied editing captions/cover", async () => {
    await expect(updatePropertyImage({ imageId: "img1", actorId: "fe1", organizationId: "org_default", role: "FIELD_EXECUTIVE", caption: "x" })).rejects.toThrow(ApiError);
    expect(propertyImageUpdate).not.toHaveBeenCalled();
  });

  it("refuses to edit a deleted image", async () => {
    propertyImageFindFirst.mockResolvedValue({ id: "img1", propertyId: "prop1", status: "DELETED" });
    await expect(updatePropertyImage({ imageId: "img1", actorId: "admin1", organizationId: "org_default", role: "ADMIN", caption: "x" })).rejects.toThrow(ApiError);
  });
});

describe("reorderPropertyImages", () => {
  it("applies the new order as a single transaction when the id set matches exactly", async () => {
    propertyImageFindMany
      .mockResolvedValueOnce([{ id: "a" }, { id: "b" }, { id: "c" }]) // existing-set validation
      .mockResolvedValueOnce([{ id: "b" }, { id: "a" }, { id: "c" }]); // listPropertyImages after reorder

    await reorderPropertyImages({ propertyId: "prop1", actorId: "admin1", organizationId: "org_default", role: "ADMIN", order: ["b", "a", "c"] });

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(propertyImageUpdate).toHaveBeenCalledTimes(3);
    expect(propertyImageUpdate).toHaveBeenNthCalledWith(1, { where: { id: "b" }, data: { sortOrder: 0 } });
  });

  it("rejects an order that doesn't match the current active id set", async () => {
    propertyImageFindMany.mockResolvedValueOnce([{ id: "a" }, { id: "b" }]);
    await expect(reorderPropertyImages({ propertyId: "prop1", actorId: "admin1", organizationId: "org_default", role: "ADMIN", order: ["a", "z"] })).rejects.toThrow(ApiError);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("Field Executive is denied reordering", async () => {
    await expect(reorderPropertyImages({ propertyId: "prop1", actorId: "fe1", organizationId: "org_default", role: "FIELD_EXECUTIVE", order: [] })).rejects.toThrow(ApiError);
    expect(propertyImageFindMany).not.toHaveBeenCalled();
  });
});

describe("getCoverImageUrls", () => {
  it("returns a signed URL only for properties with an ACTIVE cover image", async () => {
    propertyImageFindMany.mockResolvedValueOnce([{ propertyId: "prop1", storageKey: "orgs/org/prop1/cover.jpg" }]);
    const urls = await getCoverImageUrls(["prop1", "prop2"], "org_default");
    expect(urls).toEqual({ prop1: "https://signed.example/orgs/org/prop1/cover.jpg" });
    expect(urls.prop2).toBeUndefined();
  });

  it("returns an empty object for an empty id list without querying the database", async () => {
    const urls = await getCoverImageUrls([], "org_default");
    expect(urls).toEqual({});
    expect(propertyImageFindMany).not.toHaveBeenCalled();
  });
});
