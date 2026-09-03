import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Behavioral two-organization test for property-images.ts / property-image-
// upload.ts. Unlike property-images.test.ts (which mocks every prisma call
// as a bare vi.fn()), the fakes here actually filter by the `where` clause
// the code passes in - so if a code path ever dropped its organizationId
// filter, ORG_A would successfully read/write ORG_B's property images and
// these tests would catch it, the same way catalogues-org-isolation.test.ts
// catches it for catalogues.
// ---------------------------------------------------------------------------

const ORG_A = "org_a";
const ORG_B = "org_b";

const properties = [
  { id: "prop-a", organizationId: ORG_A },
  { id: "prop-b", organizationId: ORG_B },
];

let propertyImages: Array<{
  id: string;
  organizationId: string;
  propertyId: string;
  status: string;
  purpose: string;
  isCover: boolean;
  sortOrder: number;
  storageKey: string;
  visibility: string;
}>;

function resetFixtures() {
  propertyImages = [
    { id: "img-a", organizationId: ORG_A, propertyId: "prop-a", status: "ACTIVE", purpose: "IMAGE", isCover: true, sortOrder: 0, storageKey: "organizations/org_a/properties/prop-a/images/1.jpg", visibility: "PUBLIC" },
    { id: "img-b", organizationId: ORG_B, propertyId: "prop-b", status: "ACTIVE", purpose: "IMAGE", isCover: true, sortOrder: 0, storageKey: "organizations/org_b/properties/prop-b/images/1.jpg", visibility: "PUBLIC" },
  ];
}
resetFixtures();

const propertyFindFirst = vi.fn(async (args: { where: { id: string; organizationId: string } }) =>
  properties.find((p) => p.id === args.where.id && p.organizationId === args.where.organizationId) ?? null
);

const propertyImageFindFirst = vi.fn(async (args: { where: { id?: string; organizationId: string; storageKey?: string } }) =>
  propertyImages.find(
    (i) =>
      i.organizationId === args.where.organizationId &&
      (args.where.id === undefined || i.id === args.where.id) &&
      (args.where.storageKey === undefined || i.storageKey === args.where.storageKey)
  ) ?? null
);

const propertyImageFindMany = vi.fn(async (args: { where: { propertyId?: string | { in: string[] }; organizationId: string; status?: string; purpose?: string; isCover?: boolean; visibility?: string } }) =>
  propertyImages.filter((i) => {
    const propertyIdMatch =
      args.where.propertyId === undefined ||
      (typeof args.where.propertyId === "string" ? i.propertyId === args.where.propertyId : args.where.propertyId.in.includes(i.propertyId));
    return (
      propertyIdMatch &&
      i.organizationId === args.where.organizationId &&
      (args.where.status === undefined || i.status === args.where.status) &&
      (args.where.purpose === undefined || i.purpose === args.where.purpose) &&
      (args.where.isCover === undefined || i.isCover === args.where.isCover) &&
      (args.where.visibility === undefined || i.visibility === args.where.visibility)
    );
  })
);

const propertyImageCount = vi.fn(async (args: { where: { propertyId: string; organizationId: string; status?: string; purpose?: string } }) =>
  propertyImages.filter(
    (i) =>
      i.propertyId === args.where.propertyId &&
      i.organizationId === args.where.organizationId &&
      (args.where.status === undefined || i.status === args.where.status) &&
      (args.where.purpose === undefined || i.purpose === args.where.purpose)
  ).length
);

const propertyImageUpdate = vi.fn(async (args: { where: { id: string }; data?: { status?: string } }) => ({
  id: args.where.id,
  status: args.data?.status ?? "ACTIVE",
}));
const propertyImageUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
const propertyImageAggregate = vi.fn().mockResolvedValue({ _max: { sortOrder: 0 } });
const propertyImageCreate = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    property: { findFirst: (...a: unknown[]) => propertyFindFirst(...(a as [never])) },
    propertyImage: {
      findFirst: (...a: unknown[]) => propertyImageFindFirst(...(a as [never])),
      findMany: (...a: unknown[]) => propertyImageFindMany(...(a as [never])),
      count: (...a: unknown[]) => propertyImageCount(...(a as [never])),
      update: (...a: unknown[]) => propertyImageUpdate(...(a as [never])),
      updateMany: (...a: unknown[]) => propertyImageUpdateMany(...a),
      aggregate: (...a: unknown[]) => propertyImageAggregate(...a),
      create: (...a: unknown[]) => propertyImageCreate(...a),
    },
    $transaction: async (arg: unknown) => {
      if (typeof arg === "function") {
        return (arg as (tx: unknown) => Promise<unknown>)({
          propertyImage: {
            update: (...a: unknown[]) => propertyImageUpdate(...(a as [never])),
            // softDeletePropertyImage looks for a next cover candidate when
            // the deleted image was the cover - not the focus of these
            // isolation tests, so it's a no-op find (no promotion).
            findFirst: async () => null,
          },
        });
      }
      return Promise.all(arg as Promise<unknown>[]);
    },
  },
}));

vi.mock("./api-auth", () => {
  class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { ApiError };
});

vi.mock("./audit", () => ({ recordAudit: vi.fn() }));
vi.mock("./logger", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

const uploadFileBuffer = vi.fn().mockResolvedValue({ objectKey: "k", sizeBytes: 10, contentType: "image/jpeg" });
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

const {
  uploadPropertyImage,
  softDeletePropertyImage,
  physicalDeletePropertyImage,
  updatePropertyImage,
  reorderPropertyImages,
  listPropertyImages,
  getCoverImageUrls,
} = await import("./property-images");

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0]);

beforeEach(() => {
  vi.clearAllMocks();
  uploadFileBuffer.mockResolvedValue({ objectKey: "k", sizeBytes: JPEG_BYTES.byteLength, contentType: "image/jpeg" });
  resetFixtures();
});

describe("property images - organization isolation", () => {
  it("ORG_A cannot upload an image to ORG_B's property", async () => {
    await expect(
      uploadPropertyImage({ actorId: "admin-a", organizationId: ORG_A, role: "ADMIN", propertyId: "prop-b", fileName: "x.jpg", mimeType: "image/jpeg", buffer: JPEG_BYTES })
    ).rejects.toMatchObject({ status: 404 });
    expect(uploadFileBuffer).not.toHaveBeenCalled();
  });

  it("ORG_A cannot soft-delete ORG_B's image", async () => {
    await expect(
      softDeletePropertyImage({ imageId: "img-b", actorId: "admin-a", organizationId: ORG_A, role: "ADMIN" })
    ).rejects.toMatchObject({ status: 404 });
    expect(propertyImageUpdate).not.toHaveBeenCalled();
  });

  it("ORG_A cannot physically delete ORG_B's image (and never touches storage for it)", async () => {
    await expect(
      physicalDeletePropertyImage({ imageId: "img-b", actorId: "admin-a", organizationId: ORG_A, role: "ADMIN" })
    ).rejects.toMatchObject({ status: 404 });
    expect(deleteObjectMock).not.toHaveBeenCalled();
  });

  it("ORG_A cannot update (caption/cover) ORG_B's image", async () => {
    await expect(
      updatePropertyImage({ imageId: "img-b", actorId: "dm-a", organizationId: ORG_A, role: "DATA_MANAGER", caption: "hijacked" })
    ).rejects.toMatchObject({ status: 404 });
    expect(propertyImageUpdate).not.toHaveBeenCalled();
  });

  it("ORG_A's reorder of ORG_B's property is rejected - the org-scoped query sees zero of ORG_B's images", async () => {
    await expect(
      reorderPropertyImages({ propertyId: "prop-b", actorId: "admin-a", organizationId: ORG_A, role: "ADMIN", order: ["img-b"] })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("listPropertyImages never returns ORG_B's images to ORG_A", async () => {
    const images = await listPropertyImages("prop-b", ORG_A);
    expect(images).toEqual([]);
  });

  it("listPropertyImages returns ORG_B's own images to ORG_B", async () => {
    const images = await listPropertyImages("prop-b", ORG_B);
    expect(images.map((i) => i.id)).toEqual(["img-b"]);
  });

  it("getCoverImageUrls omits ORG_B's property entirely when queried as ORG_A", async () => {
    const urls = await getCoverImageUrls(["prop-a", "prop-b"], ORG_A);
    expect(Object.keys(urls)).toEqual(["prop-a"]);
  });

  it("replacePropertyImage refuses to touch ORG_B's image from ORG_A's context", async () => {
    const { replacePropertyImage } = await import("./property-images");
    await expect(
      replacePropertyImage({ imageId: "img-b", actorId: "admin-a", organizationId: ORG_A, role: "ADMIN", fileName: "new.jpg", mimeType: "image/jpeg", buffer: JPEG_BYTES })
    ).rejects.toMatchObject({ status: 404 });
    expect(uploadFileBuffer).not.toHaveBeenCalled();
  });

  it("sanity: ORG_A can manage its own image", async () => {
    const result = await softDeletePropertyImage({ imageId: "img-a", actorId: "admin-a", organizationId: ORG_A, role: "ADMIN" });
    expect(result).toBeTruthy();
  });
});
