import { describe, it, expect, vi, beforeEach } from "vitest";

const leadFindMany = vi.fn();
const propertyFindMany = vi.fn();
const userFindMany = vi.fn();
const visitFindMany = vi.fn();
const followUpFindMany = vi.fn();
const documentFindMany = vi.fn();
const dealFindMany = vi.fn();
const paymentFindMany = vi.fn();
const catalogueShareFindMany = vi.fn();
const notificationFindMany = vi.fn();

vi.mock("../prisma", () => ({
  prisma: {
    lead: { findMany: (...a: unknown[]) => leadFindMany(...a) },
    property: { findMany: (...a: unknown[]) => propertyFindMany(...a) },
    user: { findMany: (...a: unknown[]) => userFindMany(...a) },
    visit: { findMany: (...a: unknown[]) => visitFindMany(...a) },
    followUp: { findMany: (...a: unknown[]) => followUpFindMany(...a) },
    document: { findMany: (...a: unknown[]) => documentFindMany(...a) },
    deal: { findMany: (...a: unknown[]) => dealFindMany(...a) },
    payment: { findMany: (...a: unknown[]) => paymentFindMany(...a) },
    catalogueShare: { findMany: (...a: unknown[]) => catalogueShareFindMany(...a) },
    notification: { findMany: (...a: unknown[]) => notificationFindMany(...a) },
  },
}));

import { runGlobalSearch } from "./entity-search";

beforeEach(() => {
  vi.clearAllMocks();
  leadFindMany.mockResolvedValue([]);
  propertyFindMany.mockResolvedValue([]);
  userFindMany.mockResolvedValue([]);
  visitFindMany.mockResolvedValue([]);
  followUpFindMany.mockResolvedValue([]);
  documentFindMany.mockResolvedValue([]);
  dealFindMany.mockResolvedValue([]);
  paymentFindMany.mockResolvedValue([]);
  catalogueShareFindMany.mockResolvedValue([]);
  notificationFindMany.mockResolvedValue([]);
});

const ctx = { organizationId: "org_default", role: "ADMIN" as const, userId: "admin1" };

describe("runGlobalSearch", () => {
  it("returns no results and does not query anything for an empty query", async () => {
    const response = await runGlobalSearch("", ctx);
    expect(response.results).toEqual([]);
    expect(leadFindMany).not.toHaveBeenCalled();
  });

  it("scopes the lead search to a field executive's own assigned leads", async () => {
    await runGlobalSearch("rahul", { organizationId: "org_default", role: "FIELD_EXECUTIVE", userId: "emp1" });
    expect(leadFindMany.mock.calls[0][0].where.assignedToId).toBe("emp1");
  });

  it("does not scope the lead search by assignedToId for admins", async () => {
    await runGlobalSearch("rahul", ctx);
    expect(leadFindMany.mock.calls[0][0].where.assignedToId).toBeUndefined();
  });

  it("skips the employee search entirely for field executives", async () => {
    await runGlobalSearch("rohit", { organizationId: "org_default", role: "FIELD_EXECUTIVE", userId: "emp1" });
    expect(userFindMany).not.toHaveBeenCalled();
  });

  it("scopes every query to the given organization id", async () => {
    await runGlobalSearch("rahul", ctx);
    expect(leadFindMany.mock.calls[0][0].where.organizationId).toBe("org_default");
    expect(propertyFindMany.mock.calls[0][0].where.organizationId).toBe("org_default");
  });

  it("restricts the search to a single entity when the query names one", async () => {
    await runGlobalSearch("properties without photos", ctx);
    expect(propertyFindMany).toHaveBeenCalled();
    expect(leadFindMany).not.toHaveBeenCalled();
  });

  it("does not throw on SQL-injection-shaped input - it becomes an inert keyword filter", async () => {
    await expect(runGlobalSearch("'; DROP TABLE leads; --", ctx)).resolves.toBeDefined();
    expect(leadFindMany.mock.calls[0][0].where.OR[0].clientName.contains).toContain("DROP");
  });

  it("caps combined results at the total limit", async () => {
    leadFindMany.mockResolvedValue(Array.from({ length: 8 }, (_, i) => ({ id: `l${i}`, clientName: "Rahul", phone: "999", preferredLocation: "X", status: "NEW" })));
    propertyFindMany.mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, title: "T", propertyCode: "PC", area: "X", status: "AVAILABLE", listingType: "RENT", monthlyRent: 1000, salePrice: null }))
    );
    const response = await runGlobalSearch("rahul", ctx);
    expect(response.results.length).toBeLessThanOrEqual(40);
  });
});
