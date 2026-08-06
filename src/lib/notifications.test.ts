import { describe, it, expect, vi, beforeEach } from "vitest";

const leadFindMany = vi.fn();
const notificationFindMany = vi.fn();
const notificationCreate = vi.fn();
const catalogueShareFindMany = vi.fn();
const visitFindMany = vi.fn();
const propertyFindMany = vi.fn();
const dealFindMany = vi.fn();
const documentFindMany = vi.fn();
const paymentFindMany = vi.fn();
const followUpFindMany = vi.fn();
const followUpUpdate = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    lead: { findMany: (...a: unknown[]) => leadFindMany(...a) },
    notification: {
      findMany: (...a: unknown[]) => notificationFindMany(...a),
      create: (...a: unknown[]) => notificationCreate(...a),
      count: vi.fn().mockResolvedValue(0),
    },
    catalogueShare: { findMany: (...a: unknown[]) => catalogueShareFindMany(...a) },
    visit: { findMany: (...a: unknown[]) => visitFindMany(...a) },
    property: { findMany: (...a: unknown[]) => propertyFindMany(...a) },
    deal: { findMany: (...a: unknown[]) => dealFindMany(...a) },
    document: { findMany: (...a: unknown[]) => documentFindMany(...a) },
    payment: { findMany: (...a: unknown[]) => paymentFindMany(...a) },
    followUp: {
      findMany: (...a: unknown[]) => followUpFindMany(...a),
      update: (...a: unknown[]) => followUpUpdate(...a),
    },
    systemConfig: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

import { generateSmartNotifications } from "./notifications";

beforeEach(() => {
  vi.clearAllMocks();
  notificationCreate.mockImplementation((args: { data: unknown }) => Promise.resolve(args.data));
  leadFindMany.mockResolvedValue([]);
  notificationFindMany.mockResolvedValue([]);
  catalogueShareFindMany.mockResolvedValue([]);
  visitFindMany.mockResolvedValue([]);
  propertyFindMany.mockResolvedValue([]);
  dealFindMany.mockResolvedValue([]);
  documentFindMany.mockResolvedValue([]);
  paymentFindMany.mockResolvedValue([]);
});

describe("generateSmartNotifications - HOT_LEAD_NO_FOLLOWUP", () => {
  it("notifies the assigned employee for a hot lead with no follow-up", async () => {
    leadFindMany.mockResolvedValueOnce([{ id: "l1", clientName: "Rahul", assignedToId: "emp1" }]);
    await generateSmartNotifications("org_default");
    expect(notificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "HOT_LEAD_NO_FOLLOWUP", userId: "emp1", leadId: "l1" }) })
    );
  });

  it("broadcasts to DATA_MANAGER when the lead is unassigned", async () => {
    leadFindMany.mockResolvedValueOnce([{ id: "l1", clientName: "Rahul", assignedToId: null }]);
    await generateSmartNotifications("org_default");
    expect(notificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "HOT_LEAD_NO_FOLLOWUP", role: "DATA_MANAGER", userId: null }) })
    );
  });

  it("is idempotent within the cooldown window - skips a lead already notified recently", async () => {
    leadFindMany.mockResolvedValueOnce([{ id: "l1", clientName: "Rahul", assignedToId: "emp1" }]);
    notificationFindMany.mockImplementation((args: { where: { type?: string } }) =>
      args.where.type === "HOT_LEAD_NO_FOLLOWUP" ? Promise.resolve([{ leadId: "l1" }]) : Promise.resolve([])
    );
    await generateSmartNotifications("org_default");
    const hotLeadCalls = notificationCreate.mock.calls.filter((c) => c[0].data.type === "HOT_LEAD_NO_FOLLOWUP");
    expect(hotLeadCalls.length).toBe(0);
  });
});

describe("generateSmartNotifications - CATALOGUE_NO_RESPONSE", () => {
  it("notifies the lead's assigned employee when a catalogue was viewed with no interest recorded", async () => {
    catalogueShareFindMany.mockResolvedValueOnce([
      { id: "cs1", leadId: "l1", title: "Ramesh Nagar options", lead: { clientName: "Priya", assignedToId: "emp2" } },
    ]);
    await generateSmartNotifications("org_default");
    expect(notificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "CATALOGUE_NO_RESPONSE", userId: "emp2", leadId: "l1" }) })
    );
  });
});

describe("generateSmartNotifications - VISIT_MISSED", () => {
  it("notifies the visit's assigned employee and links both leadId and visitId", async () => {
    visitFindMany.mockResolvedValueOnce([{ id: "v1", leadId: "l1", assignedToId: "emp3", status: "CLIENT_NO_SHOW", lead: { clientName: "Amit" } }]);
    await generateSmartNotifications("org_default");
    expect(notificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "VISIT_MISSED", userId: "emp3", leadId: "l1", visitId: "v1" }) })
    );
  });
});

describe("generateSmartNotifications - PROPERTY_MISSING_PHOTOS", () => {
  it("broadcasts to ADMIN and DATA_MANAGER for a property with no images", async () => {
    propertyFindMany.mockImplementation((args: { where?: { images?: string } }) =>
      args?.where?.images === "[]" ? Promise.resolve([{ id: "p1", title: "2BHK Flat", propertyCode: "PC1" }]) : Promise.resolve([])
    );
    await generateSmartNotifications("org_default");
    const roles = notificationCreate.mock.calls.filter((c) => c[0].data.type === "PROPERTY_MISSING_PHOTOS").map((c) => c[0].data.role);
    expect(roles).toEqual(expect.arrayContaining(["ADMIN", "DATA_MANAGER"]));
  });
});

describe("generateSmartNotifications - DEAL_NEGOTIATION_STALE", () => {
  it("skips deals with no linked lead (no entity to notify against)", async () => {
    dealFindMany.mockResolvedValueOnce([{ id: "d1", dealCode: "DL1", assignedToId: "emp1", leadId: null }]);
    await generateSmartNotifications("org_default");
    const calls = notificationCreate.mock.calls.filter((c) => c[0].data.type === "DEAL_NEGOTIATION_STALE");
    expect(calls.length).toBe(0);
  });

  it("notifies the deal's assigned employee when it has a linked lead", async () => {
    dealFindMany.mockResolvedValueOnce([{ id: "d1", dealCode: "DL1", assignedToId: "emp1", leadId: "l1" }]);
    await generateSmartNotifications("org_default");
    expect(notificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "DEAL_NEGOTIATION_STALE", userId: "emp1", leadId: "l1" }) })
    );
  });
});

describe("generateSmartNotifications - PAYMENT_PENDING (overdue)", () => {
  it("skips payments whose deal has no linked lead", async () => {
    paymentFindMany.mockResolvedValueOnce([{ id: "pay1", amount: 5000, deal: { dealCode: "DL1", leadId: null, assignedToId: "emp1" } }]);
    await generateSmartNotifications("org_default");
    const calls = notificationCreate.mock.calls.filter((c) => c[0].data.type === "PAYMENT_PENDING");
    expect(calls.length).toBe(0);
  });

  it("notifies the deal's assigned employee for an overdue payment with a linked lead", async () => {
    paymentFindMany.mockResolvedValueOnce([{ id: "pay1", amount: 5000, deal: { dealCode: "DL1", leadId: "l1", assignedToId: "emp1" } }]);
    await generateSmartNotifications("org_default");
    expect(notificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "PAYMENT_PENDING", userId: "emp1", leadId: "l1" }) })
    );
  });
});

describe("generateSmartNotifications - DOCUMENT_EXPIRING", () => {
  it("skips documents with no leadId or propertyId", async () => {
    documentFindMany.mockResolvedValueOnce([{ id: "doc1", fileName: "aadhaar.pdf", expiresAt: new Date(), leadId: null, propertyId: null }]);
    await generateSmartNotifications("org_default");
    const calls = notificationCreate.mock.calls.filter((c) => c[0].data.type === "DOCUMENT_EXPIRING");
    expect(calls.length).toBe(0);
  });

  it("notifies for a document linked to a lead", async () => {
    documentFindMany.mockResolvedValueOnce([{ id: "doc1", fileName: "agreement.pdf", expiresAt: new Date("2026-08-10"), leadId: "l1", propertyId: null }]);
    await generateSmartNotifications("org_default");
    expect(notificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "DOCUMENT_EXPIRING", leadId: "l1" }) })
    );
  });
});

describe("generateSmartNotifications - organization scoping", () => {
  it("scopes every underlying query to the given organization id", async () => {
    await generateSmartNotifications("org_xyz");
    expect(leadFindMany.mock.calls[0][0].where.organizationId).toBe("org_xyz");
    expect(propertyFindMany.mock.calls.some((c) => c[0].where.organizationId === "org_xyz")).toBe(true);
  });
});
