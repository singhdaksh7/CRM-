import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const propertyFindFirst = vi.fn();
const propertyImageCount = vi.fn();
const propertyImageCreate = vi.fn();
const propertyImageFindFirst = vi.fn();
const propertyImageUpdateMany = vi.fn();
const propertyImageAggregate = vi.fn();
const storageUploadSessionCreate = vi.fn();
const storageUploadSessionFindFirst = vi.fn();
const storageUploadSessionUpdate = vi.fn();
const txPropertyImageCreate = vi.fn();
const txSessionUpdate = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    property: { findFirst: (...a: unknown[]) => propertyFindFirst(...a) },
    propertyImage: {
      count: (...a: unknown[]) => propertyImageCount(...a),
      create: (...a: unknown[]) => propertyImageCreate(...a),
      findFirst: (...a: unknown[]) => propertyImageFindFirst(...a),
      updateMany: (...a: unknown[]) => propertyImageUpdateMany(...a),
      aggregate: (...a: unknown[]) => propertyImageAggregate(...a),
    },
    storageUploadSession: {
      create: (...a: unknown[]) => storageUploadSessionCreate(...a),
      findFirst: (...a: unknown[]) => storageUploadSessionFindFirst(...a),
      update: (...a: unknown[]) => storageUploadSessionUpdate(...a),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        propertyImage: { create: (...a: unknown[]) => txPropertyImageCreate(...a) },
        storageUploadSession: { update: (...a: unknown[]) => txSessionUpdate(...a) },
      }),
  },
}));

vi.mock("./organization", () => ({ getOrganizationId: () => "org_default" }));
vi.mock("./audit", () => ({ recordAudit: vi.fn() }));
vi.mock("./logger", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock("./system-config", () => ({
  getSystemConfig: vi.fn().mockResolvedValue({ maxImagesPerProperty: 25, maxStorageBytes: 0 }),
}));
vi.mock("./api-auth", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

const createPropertyImageUploadUrl = vi.fn();
const verifyUploadedObject = vi.fn();
vi.mock("./storage", async () => {
  const actual = await vi.importActual<typeof import("./storage")>("./storage");
  return {
    ...actual,
    isStorageConfigured: () => true,
    activeStorageProviderName: () => "MOCK",
    createPropertyImageUploadUrl: (...a: unknown[]) => createPropertyImageUploadUrl(...a),
    verifyUploadedObject: (...a: unknown[]) => verifyUploadedObject(...a),
  };
});

describe("property-image-upload sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    propertyFindFirst.mockResolvedValue({ id: "prop1" });
    propertyImageCount.mockResolvedValue(0);
    createPropertyImageUploadUrl.mockResolvedValue({
      method: "PUT",
      uploadUrl: "https://example.com/put",
      key: "organizations/org_default/properties/prop1/images/abc.webp",
      expiresIn: 300,
    });
    storageUploadSessionCreate.mockResolvedValue({
      id: "sess1",
      objectKey: "organizations/org_default/properties/prop1/images/abc.webp",
    });
  });

  afterEach(() => {
    vi.resetModules();
  });

  // First dynamic import() of ./property-image-upload in this file also
  // pulls in ./storage -> storage-providers/index.ts, which statically
  // imports every provider's SDK (AWS S3 client, firebase-admin) regardless
  // of the MOCK provider mocked below - a real ~2s cold-module cost that can
  // exceed the 5s default timeout under full-suite parallel CPU contention.
  it("creates an upload session with a server-generated object key", async () => {
    const { createPropertyImageUploadSession } = await import("./property-image-upload");
    const result = await createPropertyImageUploadSession({
      actorId: "admin1", organizationId: "org_default",
      role: "ADMIN",
      propertyId: "prop1",
      fileName: "living.webp",
      mimeType: "image/webp",
      sizeBytes: 1200,
      isCover: true,
    });
    expect(result.sessionId).toBe("sess1");
    expect(result.uploadUrl).toContain("https://");
    expect(storageUploadSessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org_default",
          entityId: "prop1",
          status: "PENDING",
          isCover: true,
        }),
      })
    );
  }, 20000);

  it("rejects SVG / dangerous types via validation", async () => {
    const { createPropertyImageUploadSession } = await import("./property-image-upload");
    await expect(
      createPropertyImageUploadSession({
        actorId: "admin1", organizationId: "org_default",
        role: "ADMIN",
        propertyId: "prop1",
        fileName: "x.svg",
        mimeType: "image/svg+xml" as "image/jpeg",
        sizeBytes: 100,
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("confirm is idempotent when session already CONFIRMED", async () => {
    storageUploadSessionFindFirst.mockResolvedValue({
      id: "sess1",
      organizationId: "org_default",
      actorId: "admin1",
      entityId: "prop1",
      purpose: "PROPERTY_IMAGE",
      status: "CONFIRMED",
      propertyImageId: "img1",
      expiresAt: new Date(Date.now() + 60_000),
      objectKey: "organizations/org_default/properties/prop1/images/abc.webp",
    });
    propertyImageFindFirst.mockResolvedValue({ id: "img1", storageKey: "organizations/org_default/properties/prop1/images/abc.webp" });

    const { confirmPropertyImageUpload } = await import("./property-image-upload");
    const first = await confirmPropertyImageUpload({
      actorId: "admin1", organizationId: "org_default",
      role: "ADMIN",
      propertyId: "prop1",
      sessionId: "sess1",
    });
    const second = await confirmPropertyImageUpload({
      actorId: "admin1", organizationId: "org_default",
      role: "ADMIN",
      propertyId: "prop1",
      sessionId: "sess1",
    });
    expect(first.id).toBe("img1");
    expect(second.id).toBe("img1");
    expect(txPropertyImageCreate).not.toHaveBeenCalled();
  });

  it("confirm creates PropertyImage after verify", async () => {
    storageUploadSessionFindFirst.mockResolvedValue({
      id: "sess1",
      organizationId: "org_default",
      actorId: "admin1",
      entityId: "prop1",
      purpose: "PROPERTY_IMAGE",
      status: "PENDING",
      propertyImageId: null,
      expiresAt: new Date(Date.now() + 60_000),
      objectKey: "organizations/org_default/properties/prop1/images/abc.webp",
      mimeType: "image/webp",
      sizeBytes: 1200,
      originalFilename: "living.webp",
      imagePurpose: "IMAGE",
      visibility: "PUBLIC",
      isCover: true,
      caption: null,
    });
    verifyUploadedObject.mockResolvedValue({ sizeBytes: 1200, contentType: "image/webp" });
    propertyImageFindFirst.mockResolvedValue(null);
    propertyImageAggregate.mockResolvedValue({ _max: { sortOrder: -1 } });
    propertyImageCount.mockResolvedValue(0);
    txPropertyImageCreate.mockResolvedValue({ id: "img-new", isCover: true, storageKey: "organizations/org_default/properties/prop1/images/abc.webp" });
    txSessionUpdate.mockResolvedValue({});

    const { confirmPropertyImageUpload } = await import("./property-image-upload");
    const image = await confirmPropertyImageUpload({
      actorId: "admin1", organizationId: "org_default",
      role: "ADMIN",
      propertyId: "prop1",
      sessionId: "sess1",
      width: 1600,
      height: 1200,
    });
    expect(image.id).toBe("img-new");
    expect(verifyUploadedObject).toHaveBeenCalled();
  });

  it("FIELD_EXECUTIVE cannot upload FLOOR_PLAN", async () => {
    const { createPropertyImageUploadSession } = await import("./property-image-upload");
    await expect(
      createPropertyImageUploadSession({
        actorId: "fe1", organizationId: "org_default",
        role: "FIELD_EXECUTIVE",
        propertyId: "prop1",
        fileName: "plan.webp",
        mimeType: "image/webp",
        sizeBytes: 1000,
        purpose: "FLOOR_PLAN",
      })
    ).rejects.toMatchObject({ status: 403 });
  });
});
