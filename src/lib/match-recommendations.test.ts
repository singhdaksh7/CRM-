import { describe, it, expect, vi, beforeEach } from "vitest";

const propertyFindUniqueOrThrow = vi.fn();
const leadFindMany = vi.fn();
const matchRecommendationFindMany = vi.fn();
const matchRecommendationUpsert = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    property: { findUniqueOrThrow: (...a: unknown[]) => propertyFindUniqueOrThrow(...a) },
    lead: { findMany: (...a: unknown[]) => leadFindMany(...a) },
    matchRecommendation: {
      findMany: (...a: unknown[]) => matchRecommendationFindMany(...a),
      upsert: (...a: unknown[]) => matchRecommendationUpsert(...a),
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

const matchPropertyToLead = vi.fn();
vi.mock("./matching", () => ({ matchPropertyToLead: (...a: unknown[]) => matchPropertyToLead(...a) }));

const { recommendPropertyToWaitingLeads } = await import("./match-recommendations");

function property(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "prop1",
    organizationId: "org_default",
    propertyCode: "PROP-0001",
    status: "AVAILABLE",
    listingType: "SALE",
    monthlyRent: null,
    salePrice: 14000000,
    area: "Mansarovar Garden",
    ...overrides,
  };
}

function lead(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "lead1",
    organizationId: "org_default",
    clientName: "Test Client",
    assignedToId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  matchRecommendationFindMany.mockResolvedValue([]);
  matchRecommendationUpsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({ id: "rec1", ...create }));
});

describe("recommendPropertyToWaitingLeads - notifications (A4)", () => {
  it("notifies ADMIN/DATA_MANAGER when a matching property is created", async () => {
    propertyFindUniqueOrThrow.mockResolvedValue(property());
    leadFindMany.mockResolvedValue([lead()]);
    matchPropertyToLead.mockReturnValue({ score: 90 });

    await recommendPropertyToWaitingLeads("prop1", "lifecycle-1");

    expect(notifyRoles).toHaveBeenCalledWith(
      ["ADMIN", "DATA_MANAGER"],
      expect.objectContaining({ type: "MATCHES_READY", organizationId: "org_default", propertyId: "prop1" })
    );
  });

  it("does not notify anyone for a non-matching property", async () => {
    propertyFindUniqueOrThrow.mockResolvedValue(property());
    leadFindMany.mockResolvedValue([lead()]);
    matchPropertyToLead.mockReturnValue(null);

    await recommendPropertyToWaitingLeads("prop1", "lifecycle-1");

    expect(notifyRoles).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("also notifies the lead's assigned employee directly, once per assignee", async () => {
    propertyFindUniqueOrThrow.mockResolvedValue(property());
    leadFindMany.mockResolvedValue([lead({ id: "lead1", assignedToId: "emp1" }), lead({ id: "lead2", assignedToId: "emp1" }), lead({ id: "lead3", assignedToId: null })]);
    matchPropertyToLead.mockReturnValue({ score: 90 });

    await recommendPropertyToWaitingLeads("prop1", "lifecycle-1");

    const assigneeCalls = createNotification.mock.calls.filter(([params]) => params.userId === "emp1");
    expect(assigneeCalls).toHaveLength(1);
    expect(assigneeCalls[0][0]).toEqual(
      expect.objectContaining({ type: "MATCHES_READY", organizationId: "org_default", userId: "emp1", propertyId: "prop1" })
    );
  });

  it("does not re-notify for a lead already recommended under the same lifecycleKey (duplicate recalculation)", async () => {
    propertyFindUniqueOrThrow.mockResolvedValue(property());
    leadFindMany.mockResolvedValue([lead({ id: "lead1" })]);
    matchRecommendationFindMany.mockResolvedValue([{ leadId: "lead1" }]);
    matchPropertyToLead.mockReturnValue({ score: 90 });

    await recommendPropertyToWaitingLeads("prop1", "lifecycle-1");

    expect(notifyRoles).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
    // The MatchRecommendation row itself is still upserted (idempotent, no-op update).
    expect(matchRecommendationUpsert).toHaveBeenCalled();
  });

  it("does notify again for the same lead under a NEW lifecycleKey (property was updated and re-evaluated)", async () => {
    propertyFindUniqueOrThrow.mockResolvedValue(property());
    leadFindMany.mockResolvedValue([lead({ id: "lead1" })]);
    matchRecommendationFindMany.mockResolvedValue([]); // no row under this new lifecycleKey
    matchPropertyToLead.mockReturnValue({ score: 90 });

    await recommendPropertyToWaitingLeads("prop1", "lifecycle-2");

    expect(notifyRoles).toHaveBeenCalled();
  });

  it("never notifies across organizations - all recipients scoped to the property's own org", async () => {
    propertyFindUniqueOrThrow.mockResolvedValue(property({ organizationId: "orgA" }));
    leadFindMany.mockResolvedValue([lead({ organizationId: "orgA", assignedToId: "emp-orgA" })]);
    matchPropertyToLead.mockReturnValue({ score: 90 });

    await recommendPropertyToWaitingLeads("prop1", "lifecycle-1");

    for (const [, params] of notifyRoles.mock.calls) {
      expect(params.organizationId).toBe("orgA");
    }
    for (const [params] of createNotification.mock.calls) {
      expect(params.organizationId).toBe("orgA");
    }
    // The lead query itself must have been scoped to the property's org too.
    expect(leadFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "orgA" }) }));
  });

  it("never fires a WhatsApp/customer send as a side effect of internal notification", async () => {
    // A regression guard local to this module - the real cross-repo guard
    // lives in zero-auto-send.test.ts, but this asserts the mocked
    // notification module (the only thing this function calls) is never
    // asked to do anything beyond createNotification/notifyRoles.
    propertyFindUniqueOrThrow.mockResolvedValue(property());
    leadFindMany.mockResolvedValue([lead()]);
    matchPropertyToLead.mockReturnValue({ score: 90 });

    await recommendPropertyToWaitingLeads("prop1", "lifecycle-1");

    const allCalls = [...notifyRoles.mock.calls, ...createNotification.mock.calls];
    for (const [, params] of allCalls.map((c) => [c[0], c[c.length - 1]])) {
      expect(["MATCHES_READY"]).toContain((params as { type: string }).type);
    }
  });
});
