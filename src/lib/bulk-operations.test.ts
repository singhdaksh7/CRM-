import { describe, it, expect, vi, beforeEach } from "vitest";

const leadFindFirst = vi.fn();
const leadUpdate = vi.fn();
const followUpCreate = vi.fn();
const propertyFindFirst = vi.fn();
const propertyFindMany = vi.fn();
const propertyUpdate = vi.fn();
const ownerUpdate = vi.fn();
const recordAudit = vi.fn();
const matchPropertiesToLead = vi.fn();
const createCatalogue = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    lead: { findFirst: (...a: unknown[]) => leadFindFirst(...a), update: (...a: unknown[]) => leadUpdate(...a) },
    followUp: { create: (...a: unknown[]) => followUpCreate(...a) },
    property: {
      findFirst: (...a: unknown[]) => propertyFindFirst(...a),
      findMany: (...a: unknown[]) => propertyFindMany(...a),
      update: (...a: unknown[]) => propertyUpdate(...a),
    },
    owner: { update: (...a: unknown[]) => ownerUpdate(...a) },
  },
}));
vi.mock("./audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));
vi.mock("./matching", () => ({ matchPropertiesToLead: (...a: unknown[]) => matchPropertiesToLead(...a) }));
vi.mock("./catalogues", () => ({ createCatalogue: (...a: unknown[]) => createCatalogue(...a) }));

import { bulkAssignLeads, bulkUpdateLeadStatus, bulkScheduleFollowUp, bulkGenerateCatalogues, bulkUpdatePropertyAvailability, bulkVerifyPropertyOwners, bulkAddPropertyTags } from "./bulk-operations";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("bulkAssignLeads", () => {
  it("reports per-item success and continues past a not-found lead", async () => {
    leadFindFirst.mockResolvedValueOnce({ id: "l1", assignedToId: null }).mockResolvedValueOnce(null);
    leadUpdate.mockResolvedValue({});

    const result = await bulkAssignLeads(["l1", "l2"], "emp1", "org_default", "user1");

    expect(result.total).toBe(2);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results.find((r) => r.id === "l2")?.error).toMatch(/not found/i);
  });

  it("scopes the lookup to the given organization", async () => {
    leadFindFirst.mockResolvedValue({ id: "l1", assignedToId: null });
    leadUpdate.mockResolvedValue({});
    await bulkAssignLeads(["l1"], "emp1", "org_xyz", "user1");
    expect(leadFindFirst.mock.calls[0][0].where.organizationId).toBe("org_xyz");
  });

  it("records an audit entry for each successful assignment", async () => {
    leadFindFirst.mockResolvedValue({ id: "l1", assignedToId: null });
    leadUpdate.mockResolvedValue({});
    await bulkAssignLeads(["l1"], "emp1", "org_default", "user1");
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "UPDATE", entityType: "Lead", entityId: "l1" }));
  });

  it("caps the batch at 100 ids", async () => {
    leadFindFirst.mockResolvedValue({ id: "x", assignedToId: null });
    leadUpdate.mockResolvedValue({});
    const ids = Array.from({ length: 150 }, (_, i) => `l${i}`);
    const result = await bulkAssignLeads(ids, "emp1", "org_default", "user1");
    expect(result.total).toBe(100);
  });
});

describe("bulkUpdateLeadStatus", () => {
  it("updates status and reports success", async () => {
    leadFindFirst.mockResolvedValue({ id: "l1", status: "NEW" });
    leadUpdate.mockResolvedValue({});
    const result = await bulkUpdateLeadStatus(["l1"], "CONTACTED" as never, "org_default", "user1");
    expect(result.succeeded).toBe(1);
    expect(leadUpdate).toHaveBeenCalledWith({ where: { id: "l1" }, data: { status: "CONTACTED" } });
  });
});

describe("bulkScheduleFollowUp", () => {
  it("creates a follow-up owned by the lead's assigned employee", async () => {
    leadFindFirst.mockResolvedValue({ id: "l1", assignedToId: "emp1" });
    followUpCreate.mockResolvedValue({ id: "f1" });
    const result = await bulkScheduleFollowUp(["l1"], "PHONE_CALL" as never, new Date("2026-08-10"), "org_default", "user1");
    expect(result.succeeded).toBe(1);
    expect(followUpCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ leadId: "l1", ownerId: "emp1", type: "PHONE_CALL" }) }));
  });
});

describe("bulkGenerateCatalogues", () => {
  it("fails a lead with no matching properties instead of creating an empty catalogue", async () => {
    leadFindFirst.mockResolvedValue({ id: "l1" });
    propertyFindMany.mockResolvedValue([]);
    matchPropertiesToLead.mockReturnValue([]);
    const result = await bulkGenerateCatalogues(["l1"], "org_default", "user1", "ADMIN" as never);
    expect(result.failed).toBe(1);
    expect(result.results[0].error).toMatch(/no matching properties/i);
    expect(createCatalogue).not.toHaveBeenCalled();
  });

  it("creates a catalogue from the top matches for a lead with inventory", async () => {
    leadFindFirst.mockResolvedValue({ id: "l1" });
    propertyFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
    matchPropertiesToLead.mockReturnValue([{ property: { id: "p1" } }, { property: { id: "p2" } }]);
    createCatalogue.mockResolvedValue({ id: "cat1" });
    const result = await bulkGenerateCatalogues(["l1"], "org_default", "user1", "ADMIN" as never);
    expect(result.succeeded).toBe(1);
    expect(createCatalogue).toHaveBeenCalledWith(expect.objectContaining({ leadId: "l1", properties: expect.arrayContaining([expect.objectContaining({ propertyId: "p1" })]) }));
  });
});

describe("bulkUpdatePropertyAvailability", () => {
  it("updates status for each property and audits the change", async () => {
    propertyFindFirst.mockResolvedValue({ id: "p1", status: "AVAILABLE" });
    propertyUpdate.mockResolvedValue({});
    const result = await bulkUpdatePropertyAvailability(["p1"], "RENTED" as never, "org_default", "user1");
    expect(result.succeeded).toBe(1);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "Property", entityId: "p1" }));
  });
});

describe("bulkVerifyPropertyOwners", () => {
  it("fails a property with no linked owner", async () => {
    propertyFindFirst.mockResolvedValue({ id: "p1", ownerId: null, owner: null });
    const result = await bulkVerifyPropertyOwners(["p1"], "org_default", "user1");
    expect(result.failed).toBe(1);
    expect(result.results[0].error).toMatch(/no owner/i);
  });

  it("verifies the linked owner", async () => {
    propertyFindFirst.mockResolvedValue({ id: "p1", ownerId: "o1", owner: { verificationStatus: "UNVERIFIED" } });
    ownerUpdate.mockResolvedValue({});
    const result = await bulkVerifyPropertyOwners(["p1"], "org_default", "user1");
    expect(result.succeeded).toBe(1);
    expect(ownerUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "o1" }, data: expect.objectContaining({ verificationStatus: "VERIFIED" }) }));
  });
});

describe("bulkAddPropertyTags", () => {
  it("merges new tags with existing ones without duplicates", async () => {
    propertyFindFirst.mockResolvedValue({ id: "p1", tags: JSON.stringify(["furnished"]) });
    propertyUpdate.mockResolvedValue({});
    const result = await bulkAddPropertyTags(["p1"], ["furnished", "premium"], "org_default", "user1");
    expect(result.succeeded).toBe(1);
    const savedTags = JSON.parse(propertyUpdate.mock.calls[0][0].data.tags);
    expect(savedTags.sort()).toEqual(["furnished", "premium"]);
  });

  it("tolerates malformed existing tags JSON", async () => {
    propertyFindFirst.mockResolvedValue({ id: "p1", tags: "not json" });
    propertyUpdate.mockResolvedValue({});
    const result = await bulkAddPropertyTags(["p1"], ["premium"], "org_default", "user1");
    expect(result.succeeded).toBe(1);
    expect(JSON.parse(propertyUpdate.mock.calls[0][0].data.tags)).toEqual(["premium"]);
  });
});
