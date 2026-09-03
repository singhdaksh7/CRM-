import { describe, it, expect, vi, beforeEach } from "vitest";

// updateCatalogue() - the "Edit Catalogue" UI's Save action (full-replace
// property set on an existing, already-ACTIVE catalogue). Verifies: the
// CatalogueShare row's id/token is never touched (public link preserved),
// a version bump + one CatalogueVersionEvent per actual add/remove + one
// CATALOGUE_VERSION_CHANGED activity entry fire only when the property set
// actually changed, and cross-org properties are rejected before any write.

const ORG_A = "org_a";
const ORG_B = "org_b";

const properties = [
  { id: "prop-a1", organizationId: ORG_A, area: "Kirti Nagar" },
  { id: "prop-a2", organizationId: ORG_A, area: "Basai Darapur" },
  { id: "prop-a3", organizationId: ORG_A, area: "Janakpuri" },
  { id: "prop-b1", organizationId: ORG_B, area: "Kirti Nagar" },
];

interface CatalogueRow {
  id: string;
  organizationId: string;
  leadId: string;
  title: string;
  status: string;
  version: number;
  token: string;
}

let catalogue: CatalogueRow;
let shareProperties: { id: string; catalogueShareId: string; propertyId: string; removedAt: Date | null }[];

function resetFixtures() {
  catalogue = { id: "cat-1", organizationId: ORG_A, leadId: "lead-1", title: "Original Title", status: "ACTIVE", version: 1, token: "stable-token-abc123" };
  shareProperties = [
    { id: "csp-1", catalogueShareId: "cat-1", propertyId: "prop-a1", removedAt: null },
    { id: "csp-2", catalogueShareId: "cat-1", propertyId: "prop-a2", removedAt: null },
  ];
}
resetFixtures();

const catalogueShareFindFirst = vi.fn(async (args: { where: { id: string; organizationId: string } }) =>
  args.where.id === catalogue.id && args.where.organizationId === catalogue.organizationId
    ? { ...catalogue, properties: shareProperties.map((p) => ({ ...p, property: properties.find((prop) => prop.id === p.propertyId) })) }
    : null
);
const catalogueShareUpdate = vi.fn(async (args: { data: Partial<CatalogueRow> }) => {
  Object.assign(catalogue, args.data);
  return { ...catalogue, properties: shareProperties.map((p) => ({ ...p, property: properties.find((prop) => prop.id === p.propertyId) })) };
});
const propertyFindMany = vi.fn(async (args: { where: { id: { in: string[] }; organizationId: string } }) =>
  properties.filter((p) => args.where.id.in.includes(p.id) && p.organizationId === args.where.organizationId)
);
const catalogueSharePropertyDeleteMany = vi.fn(async () => {
  shareProperties = [];
  return { count: 0 };
});
const catalogueSharePropertyCreateMany = vi.fn(async (args: { data: { propertyId: string }[] }) => {
  shareProperties = args.data.map((d, i) => ({ id: `csp-new-${i}`, catalogueShareId: catalogue.id, propertyId: d.propertyId, removedAt: null }));
  return { count: args.data.length };
});
const versionEventCreate = vi.fn();
const transaction = vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops));

vi.mock("./prisma", () => ({
  prisma: {
    catalogueShare: {
      findFirst: (...a: unknown[]) => catalogueShareFindFirst(...(a as [never])),
      update: (...a: unknown[]) => catalogueShareUpdate(...(a as [never])),
    },
    property: { findMany: (...a: unknown[]) => propertyFindMany(...(a as [never])) },
    catalogueShareProperty: {
      deleteMany: () => catalogueSharePropertyDeleteMany(),
      createMany: (...a: unknown[]) => catalogueSharePropertyCreateMany(...(a as [never])),
    },
    catalogueVersionEvent: { create: (...a: unknown[]) => versionEventCreate(...a) },
    $transaction: (...a: [Promise<unknown>[]]) => transaction(...a),
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

const logActivity = vi.fn();
vi.mock("./activity", () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));

const { updateCatalogue } = await import("./catalogues");
const { ApiError } = await import("./api-auth");

beforeEach(() => {
  vi.clearAllMocks();
  resetFixtures();
});

const baseProp = { customNote: null, internalNote: null, priceVisible: true, addressVisible: false, brokerageVisible: false };

describe("updateCatalogue - property set changes", () => {
  it("adds a property, bumps version, and writes one PROPERTY_ADDED version event", async () => {
    const result = await updateCatalogue("cat-1", ORG_A, {
      actorId: "user-1",
      properties: [
        { propertyId: "prop-a1", sortOrder: 0, ...baseProp },
        { propertyId: "prop-a2", sortOrder: 1, ...baseProp },
        { propertyId: "prop-a3", sortOrder: 2, ...baseProp, addedManually: true, addedByUserId: "user-1" },
      ],
    });

    expect(result.version).toBe(2);
    expect(versionEventCreate).toHaveBeenCalledTimes(1);
    expect(versionEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ changeType: "PROPERTY_ADDED", propertyId: "prop-a3", version: 2, actorId: "user-1" }),
    });
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ leadId: "lead-1", type: "CATALOGUE_VERSION_CHANGED", actorId: "user-1" }));
  });

  it("removes a property, bumps version, and writes one PROPERTY_REMOVED version event", async () => {
    const result = await updateCatalogue("cat-1", ORG_A, {
      actorId: "user-1",
      properties: [{ propertyId: "prop-a1", sortOrder: 0, ...baseProp }],
    });

    expect(result.version).toBe(2);
    expect(versionEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ changeType: "PROPERTY_REMOVED", propertyId: "prop-a2", version: 2 }),
    });
  });

  it("add + remove in the same save writes both event types under one version bump", async () => {
    await updateCatalogue("cat-1", ORG_A, {
      actorId: "user-1",
      properties: [
        { propertyId: "prop-a1", sortOrder: 0, ...baseProp },
        { propertyId: "prop-a3", sortOrder: 1, ...baseProp },
      ],
    });

    expect(versionEventCreate).toHaveBeenCalledTimes(2);
    const changeTypes = versionEventCreate.mock.calls.map((c) => (c[0] as { data: { changeType: string } }).data.changeType).sort();
    expect(changeTypes).toEqual(["PROPERTY_ADDED", "PROPERTY_REMOVED"]);
  });

  it("reordering the same set of properties (no add/remove) does not bump version or write events", async () => {
    const result = await updateCatalogue("cat-1", ORG_A, {
      actorId: "user-1",
      properties: [
        { propertyId: "prop-a2", sortOrder: 0, ...baseProp },
        { propertyId: "prop-a1", sortOrder: 1, ...baseProp },
      ],
    });

    expect(result.version).toBe(1);
    expect(versionEventCreate).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("never touches the CatalogueShare id or token - the public link is preserved", async () => {
    const result = await updateCatalogue("cat-1", ORG_A, {
      actorId: "user-1",
      properties: [{ propertyId: "prop-a3", sortOrder: 0, ...baseProp }],
    });
    expect(result.id).toBe("cat-1");
    expect(result.token).toBe("stable-token-abc123");
  });

  it("rejects a cross-organization property before any write - tenant isolation", async () => {
    await expect(
      updateCatalogue("cat-1", ORG_A, { actorId: "user-1", properties: [{ propertyId: "prop-b1", sortOrder: 0, ...baseProp }] })
    ).rejects.toMatchObject({ status: 400 });
    expect(catalogueSharePropertyDeleteMany).not.toHaveBeenCalled();
    expect(versionEventCreate).not.toHaveBeenCalled();
  });

  it("404s for a catalogue belonging to another organization", async () => {
    await expect(updateCatalogue("cat-1", ORG_B, { actorId: "user-1", properties: [] })).rejects.toBeInstanceOf(ApiError);
  });

  it("refuses to edit a non-ACTIVE catalogue", async () => {
    catalogue.status = "REVOKED";
    await expect(updateCatalogue("cat-1", ORG_A, { actorId: "user-1", properties: [{ propertyId: "prop-a1", sortOrder: 0, ...baseProp }] })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("a title-only edit (no properties) never touches version/events/activity", async () => {
    const result = await updateCatalogue("cat-1", ORG_A, { title: "New Title" });
    expect(result.title).toBe("New Title");
    expect(result.version).toBe(1);
    expect(catalogueSharePropertyDeleteMany).not.toHaveBeenCalled();
    expect(versionEventCreate).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("never calls any WhatsApp send function - zero-auto-send", async () => {
    const whatsapp = await import("./whatsapp-messages");
    const sendSpy = vi.spyOn(whatsapp, "sendOutboundMessage");
    await updateCatalogue("cat-1", ORG_A, { actorId: "user-1", properties: [{ propertyId: "prop-a3", sortOrder: 0, ...baseProp }] });
    expect(sendSpy).not.toHaveBeenCalled();
  });
});
