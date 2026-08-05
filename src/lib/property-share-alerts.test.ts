import { describe, it, expect, vi, beforeEach } from "vitest";

const catalogueSharePropertyFindMany = vi.fn();
const activityFindFirst = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    catalogueShareProperty: {
      findMany: (...a: unknown[]) => catalogueSharePropertyFindMany(...a),
    },
    activity: {
      findFirst: (...a: unknown[]) => activityFindFirst(...a),
    },
  },
}));

const logActivity = vi.fn();
vi.mock("./activity", () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));

const createNotification = vi.fn();
const notifyRoles = vi.fn();
vi.mock("./notifications", () => ({
  createNotification: (...a: unknown[]) => createNotification(...a),
  notifyRoles: (...a: unknown[]) => notifyRoles(...a),
}));

const { notifyAffectedCataloguesOfPropertyChange } = await import("./property-share-alerts");

function shareProperty(overrides: Partial<{ createdByUserId: string | null; leadId: string; catalogueShareId: string; organizationId: string }> = {}) {
  const {
    createdByUserId = "creator1",
    leadId = "lead1",
    catalogueShareId = "share1",
    organizationId = "org_default",
  } = overrides;
  return {
    id: "csp1",
    propertyId: "prop1",
    catalogueShare: {
      id: catalogueShareId,
      organizationId,
      title: "Ramesh Nagar Options",
      status: "ACTIVE",
      createdByUserId,
      leadId,
      lead: { id: leadId, clientName: "Test Client" },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  activityFindFirst.mockResolvedValue(null);
});

describe("notifyAffectedCataloguesOfPropertyChange", () => {
  it("returns notified: 0 when the property isn't on any active catalogue", async () => {
    catalogueSharePropertyFindMany.mockResolvedValue([]);

    const result = await notifyAffectedCataloguesOfPropertyChange("prop1", "UNAVAILABLE");

    expect(result.notified).toBe(0);
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("logs an activity and notifies the catalogue creator when the property becomes unavailable", async () => {
    catalogueSharePropertyFindMany.mockResolvedValue([shareProperty()]);

    const result = await notifyAffectedCataloguesOfPropertyChange("prop1", "UNAVAILABLE");

    expect(result.notified).toBe(1);
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: "lead1", type: "PROPERTY_UNAVAILABLE_AFTER_SHARE" })
    );
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "creator1", type: "PROPERTY_UNAVAILABLE_AFTER_SHARE", leadId: "lead1", propertyId: "prop1" })
    );
    expect(notifyRoles).not.toHaveBeenCalled();
  });

  it("logs an activity and notifies the catalogue creator on a price change", async () => {
    catalogueSharePropertyFindMany.mockResolvedValue([shareProperty()]);

    await notifyAffectedCataloguesOfPropertyChange("prop1", "PRICE_CHANGED");

    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: "lead1", type: "PROPERTY_PRICE_CHANGED_AFTER_SHARE" })
    );
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "PROPERTY_PRICE_CHANGED_AFTER_SHARE" })
    );
  });

  it("falls back to notifyRoles(ADMIN, DATA_MANAGER) when the catalogue has no creator on record", async () => {
    catalogueSharePropertyFindMany.mockResolvedValue([shareProperty({ createdByUserId: null })]);

    await notifyAffectedCataloguesOfPropertyChange("prop1", "UNAVAILABLE");

    expect(createNotification).not.toHaveBeenCalled();
    expect(notifyRoles).toHaveBeenCalledWith(
      ["ADMIN", "DATA_MANAGER"],
      expect.objectContaining({ type: "PROPERTY_UNAVAILABLE_AFTER_SHARE", leadId: "lead1" })
    );
  });

  it("is idempotent: skips a catalogue+property that already has a recent activity of the same type", async () => {
    catalogueSharePropertyFindMany.mockResolvedValue([shareProperty()]);
    activityFindFirst.mockResolvedValue({ id: "existing-activity" });

    const result = await notifyAffectedCataloguesOfPropertyChange("prop1", "UNAVAILABLE");

    expect(result.notified).toBe(0);
    expect(logActivity).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("notifies once per distinct affected catalogue/lead when the property is shared across multiple active catalogues", async () => {
    catalogueSharePropertyFindMany.mockResolvedValue([
      shareProperty({ leadId: "lead1", catalogueShareId: "share1" }),
      shareProperty({ leadId: "lead2", catalogueShareId: "share2" }),
    ]);

    const result = await notifyAffectedCataloguesOfPropertyChange("prop1", "UNAVAILABLE");

    expect(result.notified).toBe(2);
    expect(logActivity).toHaveBeenCalledTimes(2);
  });
});
