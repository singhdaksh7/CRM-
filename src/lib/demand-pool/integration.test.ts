import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Integration-seam tests written after merging the backend
 * (feature/demand-pool-property-matching) and UI (feature/demand-pool-ui)
 * branches together. Each test here targets a place where the two branches
 * had to agree on a contract, or a bug found specifically by wiring the
 * real UI to the real backend (as opposed to either branch's own,
 * independently-written unit tests).
 */

const findFirst = vi.fn();
const update = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { propertyRecommendation: { findFirst: (...a: unknown[]) => findFirst(...a), update: (...a: unknown[]) => update(...a) } },
}));

const { MockApiError } = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { MockApiError };
});

vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    ApiError: MockApiError,
    requireSession: async () => ({ user: { id: "u1", role: "ADMIN" } }),
    handleApiError: (err: unknown) => (err instanceof MockApiError ? NextResponse.json({ error: err.message }, { status: err.status }) : NextResponse.json({ error: "Internal server error" }, { status: 500 })),
  };
});

vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/demand-whatsapp", () => ({
  buildRecommendationMessage: () => "hello",
  buildClickToChatLink: () => "https://wa.me/911234567890?text=hello",
}));
vi.mock("@/lib/public-recommendation-dto", () => ({ getPublicPropertyRecommendationUrl: () => "https://example.test/p/1" }));

beforeEach(() => vi.clearAllMocks());

describe("POST /api/recommendations/[id]/prepare - contact-safety re-check", () => {
  it("blocks preparing a recommendation for a DO_NOT_CONTACT contact even though it matched before the flag was set", async () => {
    const { POST } = await import("@/app/api/recommendations/[id]/prepare/route");
    findFirst.mockResolvedValue({
      id: "rec1",
      property: { id: "p1", assetClass: "RESIDENTIAL", bhk: 2, listingType: "RENT", monthlyRent: 20000, area: "Rajouri Garden" },
      customerContact: { doNotContact: true, status: "DO_NOT_CONTACT", whatsAppOptOut: false, name: "Rahul", phone: "9999999999" },
      lead: null,
    });
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "rec1" }) });
    expect(res.status).toBe(409);
    expect(update).not.toHaveBeenCalled();
  });

  it("blocks preparing a recommendation for a WhatsApp-opted-out contact", async () => {
    const { POST } = await import("@/app/api/recommendations/[id]/prepare/route");
    findFirst.mockResolvedValue({
      id: "rec2",
      property: { id: "p1", assetClass: "RESIDENTIAL", bhk: 2, listingType: "RENT", monthlyRent: 20000, area: "Rajouri Garden" },
      customerContact: { doNotContact: false, status: "ACTIVE", whatsAppOptOut: true, name: "Rahul", phone: "9999999999" },
      lead: null,
    });
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "rec2" }) });
    expect(res.status).toBe(409);
    expect(update).not.toHaveBeenCalled();
  });

  it("allows preparing a recommendation for a normal, contactable customer", async () => {
    const { POST } = await import("@/app/api/recommendations/[id]/prepare/route");
    findFirst.mockResolvedValue({
      id: "rec3",
      property: { id: "p1", assetClass: "RESIDENTIAL", bhk: 2, listingType: "RENT", monthlyRent: 20000, area: "Rajouri Garden" },
      customerContact: { doNotContact: false, status: "ACTIVE", whatsAppOptOut: false, name: "Rahul", phone: "9999999999" },
      lead: null,
    });
    update.mockResolvedValue({ id: "rec3", status: "PREPARED" });
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "rec3" }) });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ where: { id: "rec3" }, data: expect.objectContaining({ status: "PREPARED" }) });
  });
});

describe("POST /api/recommendations/[id]/mark-sent - contact-safety re-check", () => {
  it("blocks marking sent for a contact that became DO_NOT_CONTACT after being prepared", async () => {
    const { POST } = await import("@/app/api/recommendations/[id]/mark-sent/route");
    findFirst.mockResolvedValue({ id: "rec1", status: "PREPARED", customerContactId: "c1", leadId: null, customerContact: { doNotContact: true, status: "DO_NOT_CONTACT", whatsAppOptOut: false } });
    const res = await POST(new Request("http://x"), { params: Promise.resolve({ id: "rec1" }) });
    expect(res.status).toBe(409);
  });
});

describe("previewContactImport - real duplicate detection, zero writes", () => {
  it("classifies a genuinely new phone as NEW and never calls a Prisma write method", async () => {
    vi.resetModules();
    const findUnique = vi.fn().mockResolvedValue(null);
    const create = vi.fn();
    vi.doMock("@/lib/prisma", () => ({ prisma: { customerContact: { findUnique, create }, customerRequirement: { findFirst: vi.fn(), create: vi.fn() } } }));
    const { previewContactImport } = await import("@/lib/imports");
    const rows = await previewContactImport({
      rows: [{ Name: "New Person", Phone: "9876543210" }],
      columnMapping: { name: "Name", phone: "Phone" },
      organizationId: "org_default",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].duplicateClass).toBe("NEW");
    expect(rows[0].action).toBe("CREATE");
    expect(create).not.toHaveBeenCalled();
  });

  it("classifies an existing contact + new requirement as EXISTING_CONTACT/UPDATE_REQUIREMENT (not silently NEW) and still never writes", async () => {
    vi.resetModules();
    const findUnique = vi.fn().mockResolvedValue({ id: "existing1" });
    const create = vi.fn();
    const requirementFindFirst = vi.fn().mockResolvedValue(null); // no identical requirement already on file
    vi.doMock("@/lib/prisma", () => ({ prisma: { customerContact: { findUnique, create }, customerRequirement: { findFirst: requirementFindFirst, create: vi.fn() } } }));
    const { previewContactImport } = await import("@/lib/imports");
    const rows = await previewContactImport({
      rows: [{ Name: "Existing Person", Phone: "9876543210", AssetClass: "RESIDENTIAL", TxnType: "RENT" }],
      columnMapping: { name: "Name", phone: "Phone", assetClass: "AssetClass", transactionType: "TxnType" },
      organizationId: "org_default",
    });
    expect(rows[0].duplicateClass).toBe("EXISTING_CONTACT");
    expect(rows[0].action).toBe("UPDATE_REQUIREMENT");
    expect(create).not.toHaveBeenCalled();
  });

  it("classifies a fully-redundant re-import (existing contact, no requirement info) as a skippable duplicate and still never writes", async () => {
    vi.resetModules();
    const findUnique = vi.fn().mockResolvedValue({ id: "existing1" });
    const create = vi.fn();
    vi.doMock("@/lib/prisma", () => ({ prisma: { customerContact: { findUnique, create }, customerRequirement: { findFirst: vi.fn(), create: vi.fn() } } }));
    const { previewContactImport } = await import("@/lib/imports");
    const rows = await previewContactImport({
      rows: [{ Name: "Existing Person", Phone: "9876543210" }],
      columnMapping: { name: "Name", phone: "Phone" },
      organizationId: "org_default",
    });
    expect(rows[0].action).toBe("SKIP");
    expect(rows[0].state).toBe("DUPLICATE");
    expect(create).not.toHaveBeenCalled();
  });
});

describe("Global search entity-type contract (CONTACT, not CUSTOMER)", () => {
  it("parser and entity-search agree on the CONTACT entity type the UI renders", async () => {
    const { parseSearchQuery } = await import("@/lib/search/parser");
    const { ALL_SEARCH_ENTITY_TYPES } = await import("@/lib/search/search-types");
    expect(parseSearchQuery("customer Rahul").entity).toBe("CONTACT");
    expect(parseSearchQuery("contact Rahul").entity).toBe("CONTACT");
    expect(ALL_SEARCH_ENTITY_TYPES).toContain("CONTACT");
    expect(ALL_SEARCH_ENTITY_TYPES).not.toContain("CUSTOMER");
    // No duplicate REQUIREMENT entry left over from the merge.
    expect(ALL_SEARCH_ENTITY_TYPES.filter((e) => e === "REQUIREMENT")).toHaveLength(1);
  });
});
