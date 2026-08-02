import { describe, it, expect, vi, beforeEach } from "vitest";

const leadFindFirst = vi.fn();
const visitFindFirst = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    lead: { findFirst: (...args: unknown[]) => leadFindFirst(...args) },
    visit: { findFirst: (...args: unknown[]) => visitFindFirst(...args) },
  },
}));

const { canAccessDocumentCategory, canUploadDocumentCategory, canAccessDocument } = await import("./document-access");

beforeEach(() => {
  leadFindFirst.mockReset();
  visitFindFirst.mockReset();
});

describe("canAccessDocumentCategory", () => {
  it("Admin can access every category", () => {
    expect(canAccessDocumentCategory("ADMIN", "AADHAAR")).toBe(true);
    expect(canAccessDocumentCategory("ADMIN", "PAN")).toBe(true);
    expect(canAccessDocumentCategory("ADMIN", "GENERAL")).toBe(true);
    expect(canAccessDocumentCategory("ADMIN", "PAYMENT_RECEIPT")).toBe(true);
  });

  it("Data Manager can access operational categories", () => {
    expect(canAccessDocumentCategory("DATA_MANAGER", "GENERAL")).toBe(true);
    expect(canAccessDocumentCategory("DATA_MANAGER", "RENT_AGREEMENT")).toBe(true);
    expect(canAccessDocumentCategory("DATA_MANAGER", "SALE_AGREEMENT")).toBe(true);
    expect(canAccessDocumentCategory("DATA_MANAGER", "DEAL_DOCUMENT")).toBe(true);
  });

  it("Data Manager cannot access Admin-only identity/financial categories", () => {
    expect(canAccessDocumentCategory("DATA_MANAGER", "AADHAAR")).toBe(false);
    expect(canAccessDocumentCategory("DATA_MANAGER", "PAN")).toBe(false);
    expect(canAccessDocumentCategory("DATA_MANAGER", "REGISTRY")).toBe(false);
    expect(canAccessDocumentCategory("DATA_MANAGER", "OWNERSHIP_PROOF")).toBe(false);
    expect(canAccessDocumentCategory("DATA_MANAGER", "OWNER_IDENTITY")).toBe(false);
    expect(canAccessDocumentCategory("DATA_MANAGER", "PAYMENT_RECEIPT")).toBe(false);
  });

  it("Field Executive can only access GENERAL category", () => {
    expect(canAccessDocumentCategory("FIELD_EXECUTIVE", "GENERAL")).toBe(true);
    expect(canAccessDocumentCategory("FIELD_EXECUTIVE", "RENT_AGREEMENT")).toBe(false);
    expect(canAccessDocumentCategory("FIELD_EXECUTIVE", "DEAL_DOCUMENT")).toBe(false);
  });

  it("Field Executive is denied every identity/financial category", () => {
    for (const category of ["AADHAAR", "PAN", "REGISTRY", "OWNER_IDENTITY", "PAYMENT_RECEIPT"] as const) {
      expect(canAccessDocumentCategory("FIELD_EXECUTIVE", category)).toBe(false);
    }
  });
});

describe("canUploadDocumentCategory", () => {
  it("mirrors the download-side policy", () => {
    expect(canUploadDocumentCategory("FIELD_EXECUTIVE", "GENERAL")).toBe(true);
    expect(canUploadDocumentCategory("FIELD_EXECUTIVE", "AADHAAR")).toBe(false);
    expect(canUploadDocumentCategory("DATA_MANAGER", "PAN")).toBe(false);
    expect(canUploadDocumentCategory("ADMIN", "PAN")).toBe(true);
  });
});

describe("canAccessDocument - full check", () => {
  it("Admin is allowed without any entity-relationship lookup", async () => {
    const allowed = await canAccessDocument("ADMIN", "admin1", { category: "AADHAAR", leadId: null, propertyId: null });
    expect(allowed).toBe(true);
    expect(leadFindFirst).not.toHaveBeenCalled();
    expect(visitFindFirst).not.toHaveBeenCalled();
  });

  it("Data Manager is denied an Admin-only category without any entity-relationship lookup", async () => {
    const allowed = await canAccessDocument("DATA_MANAGER", "dm1", { category: "AADHAAR", leadId: null, propertyId: null });
    expect(allowed).toBe(false);
    expect(leadFindFirst).not.toHaveBeenCalled();
  });

  it("Field Executive is denied a restricted category before any entity lookup", async () => {
    const allowed = await canAccessDocument("FIELD_EXECUTIVE", "fe1", { category: "AADHAAR", leadId: "lead1", propertyId: null });
    expect(allowed).toBe(false);
    expect(leadFindFirst).not.toHaveBeenCalled();
  });

  it("Field Executive is allowed a GENERAL document linked to a lead assigned to them", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead1" });
    const allowed = await canAccessDocument("FIELD_EXECUTIVE", "fe1", { category: "GENERAL", leadId: "lead1", propertyId: null });
    expect(allowed).toBe(true);
    expect(leadFindFirst).toHaveBeenCalledWith({ where: { id: "lead1", assignedToId: "fe1" }, select: { id: true } });
  });

  it("Field Executive is denied a GENERAL document linked to a lead NOT assigned to them", async () => {
    leadFindFirst.mockResolvedValue(null);
    const allowed = await canAccessDocument("FIELD_EXECUTIVE", "fe1", { category: "GENERAL", leadId: "other-lead", propertyId: null });
    expect(allowed).toBe(false);
  });

  it("Field Executive is allowed a GENERAL document linked to a property they have an assigned visit for", async () => {
    visitFindFirst.mockResolvedValue({ id: "visit1" });
    const allowed = await canAccessDocument("FIELD_EXECUTIVE", "fe1", { category: "GENERAL", leadId: null, propertyId: "prop1" });
    expect(allowed).toBe(true);
    expect(visitFindFirst).toHaveBeenCalledWith({ where: { propertyId: "prop1", assignedToId: "fe1" }, select: { id: true } });
  });

  it("Field Executive is denied a GENERAL document for an unrelated property (no assigned visit)", async () => {
    visitFindFirst.mockResolvedValue(null);
    const allowed = await canAccessDocument("FIELD_EXECUTIVE", "fe1", { category: "GENERAL", leadId: null, propertyId: "unrelated-property" });
    expect(allowed).toBe(false);
  });

  it("Field Executive is denied a GENERAL document with no lead or property link at all", async () => {
    const allowed = await canAccessDocument("FIELD_EXECUTIVE", "fe1", { category: "GENERAL", leadId: null, propertyId: null });
    expect(allowed).toBe(false);
    expect(leadFindFirst).not.toHaveBeenCalled();
    expect(visitFindFirst).not.toHaveBeenCalled();
  });
});
