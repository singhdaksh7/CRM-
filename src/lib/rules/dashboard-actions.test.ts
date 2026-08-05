import { describe, it, expect, vi, beforeEach } from "vitest";

const followUpFindMany = vi.fn();
const leadFindMany = vi.fn();
const catalogueShareFindMany = vi.fn();
const visitFindMany = vi.fn();
const propertyFindMany = vi.fn();
const dealFindMany = vi.fn();
const paymentFindMany = vi.fn();
const documentFindMany = vi.fn();
const whatsAppMessageFindMany = vi.fn();

vi.mock("../prisma", () => ({
  prisma: {
    followUp: { findMany: (...a: unknown[]) => followUpFindMany(...a) },
    lead: { findMany: (...a: unknown[]) => leadFindMany(...a) },
    catalogueShare: { findMany: (...a: unknown[]) => catalogueShareFindMany(...a) },
    visit: { findMany: (...a: unknown[]) => visitFindMany(...a) },
    property: { findMany: (...a: unknown[]) => propertyFindMany(...a) },
    deal: { findMany: (...a: unknown[]) => dealFindMany(...a) },
    payment: { findMany: (...a: unknown[]) => paymentFindMany(...a) },
    document: { findMany: (...a: unknown[]) => documentFindMany(...a) },
    whatsAppMessage: { findMany: (...a: unknown[]) => whatsAppMessageFindMany(...a) },
  },
}));

vi.mock("../organization", () => ({ getOrganizationId: () => "org_default" }));

// Cache is bypassed in tests so every call actually exercises the compute path
// and mock assertions below see the real Prisma call args, not a cache hit.
vi.mock("../cache", () => ({ cached: (_key: string, _ttl: number, compute: () => unknown) => compute() }));

import { getActionCenterItems } from "./dashboard-actions";

beforeEach(() => {
  vi.clearAllMocks();
  followUpFindMany.mockResolvedValue([]);
  leadFindMany.mockResolvedValue([]);
  catalogueShareFindMany.mockResolvedValue([]);
  visitFindMany.mockResolvedValue([]);
  propertyFindMany.mockResolvedValue([]);
  dealFindMany.mockResolvedValue([]);
  paymentFindMany.mockResolvedValue([]);
  documentFindMany.mockResolvedValue([]);
  whatsAppMessageFindMany.mockResolvedValue([]);
});

describe("getActionCenterItems", () => {
  it("maps an overdue follow-up to a CRITICAL rule with a deep link to the lead", async () => {
    followUpFindMany.mockResolvedValue([
      { id: "f1", leadId: "l1", type: "PHONE_CALL", dueDate: new Date("2026-08-01"), lead: { clientName: "Rahul" } },
    ]);
    const items = await getActionCenterItems("ADMIN", "user1");
    const rule = items.find((i) => i.id === "followup-overdue-f1");
    expect(rule?.severity).toBe("CRITICAL");
    expect(rule?.actionHref).toBe("/leads/l1");
    expect(rule?.category).toBe("FOLLOW_UP");
  });

  it("sorts the combined results by severity, most critical first", async () => {
    followUpFindMany.mockResolvedValue([
      { id: "f1", leadId: "l1", type: "PHONE_CALL", dueDate: new Date(), lead: { clientName: "Rahul" } },
    ]);
    propertyFindMany.mockImplementation((args: { where?: { updatedAt?: unknown } }) => {
      // staleAvailabilityRules is the only property.findMany caller filtering by updatedAt
      if (args?.where?.updatedAt) {
        return Promise.resolve([{ id: "p1", title: "2BHK Flat", propertyCode: "PC1", updatedAt: new Date("2020-01-01") }]);
      }
      return Promise.resolve([]);
    });
    const items = await getActionCenterItems("ADMIN", "user1");
    const severities = items.map((i) => i.severity);
    const firstMediumIndex = severities.indexOf("MEDIUM");
    const firstCriticalIndex = severities.indexOf("CRITICAL");
    expect(firstCriticalIndex).toBeLessThan(firstMediumIndex === -1 ? Infinity : firstMediumIndex);
  });

  it("produces no duplicate rule ids across every generator", async () => {
    followUpFindMany.mockResolvedValue([{ id: "f1", leadId: "l1", type: "PHONE_CALL", dueDate: new Date(), lead: { clientName: "A" } }]);
    leadFindMany.mockResolvedValue([{ id: "l2", clientName: "B" }]);
    const items = await getActionCenterItems("ADMIN", "user1");
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("scopes queries to the field executive's own records", async () => {
    await getActionCenterItems("FIELD_EXECUTIVE", "emp1");
    const followUpArgs = followUpFindMany.mock.calls[0][0];
    expect(followUpArgs.where.ownerId).toBe("emp1");
  });

  it("does not scope queries by employee for admins", async () => {
    await getActionCenterItems("ADMIN", "admin1");
    const followUpArgs = followUpFindMany.mock.calls[0][0];
    expect(followUpArgs.where.ownerId).toBeUndefined();
  });

  it("scopes every query to the organization id", async () => {
    await getActionCenterItems("ADMIN", "user1");
    expect(followUpFindMany.mock.calls[0][0].where.organizationId).toBe("org_default");
    expect(propertyFindMany.mock.calls[0][0].where.organizationId).toBe("org_default");
  });
});
