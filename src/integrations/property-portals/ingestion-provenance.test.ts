import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Portal lead provenance: an external enquiry must always leave a durable,
 * attributable trail (provider, external ids, receivedAt, raw payload hash)
 * regardless of whether it produced a new CRM lead, linked to an existing
 * one, or was held for human review. Ambiguous contacts are never
 * auto-merged and a replayed event is never ingested twice.
 */

const eventFindUnique = vi.fn();
const eventFindFirst = vi.fn();
const eventCreate = vi.fn();
const eventUpdate = vi.fn();
const leadFindMany = vi.fn();
const leadCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    externalLeadEvent: {
      findUnique: (...a: unknown[]) => eventFindUnique(...a),
      findFirst: (...a: unknown[]) => eventFindFirst(...a),
      create: (...a: unknown[]) => eventCreate(...a),
      update: (...a: unknown[]) => eventUpdate(...a),
    },
    lead: {
      findMany: (...a: unknown[]) => leadFindMany(...a),
      create: (...a: unknown[]) => leadCreate(...a),
    },
  },
}));

vi.mock("server-only", () => ({}));

const { ingestPortalLead } = await import("./ingestion");

const residentialRentEnquiry = {
  externalLeadId: "HSG-LEAD-1",
  externalEventId: "HSG-EVT-1",
  externalListingId: "HSG-LST-9",
  name: "Portal Client",
  phone: "+91 98111 00099",
  email: "portal.client@example.com",
  locality: "Rajouri Garden",
  minBudget: 30000,
  maxBudget: 45000,
  assetClass: "RESIDENTIAL" as const,
  transactionType: "RENT" as const,
  bhk: 2,
  message: "Interested in this flat",
};

const commercialRentEnquiry = {
  ...residentialRentEnquiry,
  externalLeadId: "MB-LEAD-1",
  externalEventId: "MB-EVT-1",
  assetClass: "COMMERCIAL" as const,
  locality: "Nehru Place",
  minBudget: 150000,
  maxBudget: 250000,
  bhk: 3,
  commercialPropertyType: "OFFICE_SPACE",
};

beforeEach(() => {
  vi.clearAllMocks();
  eventFindUnique.mockResolvedValue(null);
  eventFindFirst.mockResolvedValue(null);
  eventCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "evt1", ...data }));
  eventUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "evt1", ...data }));
  leadFindMany.mockResolvedValue([]);
  leadCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "lead-new", ...data }));
});

describe("new portal lead", () => {
  it("creates a CRM lead and records full provenance on the event", async () => {
    const result = await ingestPortalLead("org_default", "HOUSING", residentialRentEnquiry, { raw: 1 });
    expect(result.status).toBe("NEW");

    const eventData = eventCreate.mock.calls[0][0].data;
    expect(eventData).toMatchObject({
      organizationId: "org_default",
      provider: "HOUSING",
      externalLeadId: "HSG-LEAD-1",
      externalEventId: "HSG-EVT-1",
      externalListingId: "HSG-LST-9",
    });
    expect(eventData.rawPayloadHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("stamps provider provenance onto the created lead itself", async () => {
    await ingestPortalLead("org_default", "HOUSING", residentialRentEnquiry, { raw: 1 });
    const leadData = leadCreate.mock.calls[0][0].data;
    expect(leadData).toMatchObject({
      organizationId: "org_default",
      portalProvider: "HOUSING",
      externalLeadId: "HSG-LEAD-1",
      externalListingId: "HSG-LST-9",
      source: "HOUSING_COM",
      assetClass: "RESIDENTIAL",
      transactionType: "RENT",
      requirementType: "RENT",
    });
    expect(leadData.receivedAt).toBeInstanceOf(Date);
    expect(leadData.rawPayloadHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("back-links the created lead onto the originating event", async () => {
    await ingestPortalLead("org_default", "HOUSING", residentialRentEnquiry, { raw: 1 });
    expect(eventUpdate).toHaveBeenCalledWith({ where: { id: "evt1" }, data: { leadId: "lead-new", ingestionStatus: "RECEIVED" } });
  });

  it("maps each provider onto its canonical CRM lead source", async () => {
    await ingestPortalLead("org_default", "NINETY_NINE_ACRES", residentialRentEnquiry, { raw: 2 });
    expect(leadCreate.mock.calls[0][0].data.source).toBe("ACRES_99");
    leadCreate.mockClear();
    await ingestPortalLead("org_default", "MAGICBRICKS", residentialRentEnquiry, { raw: 3 });
    expect(leadCreate.mock.calls[0][0].data.source).toBe("MAGICBRICKS");
  });

  it("never assigns a BHK to a commercial portal lead", async () => {
    await ingestPortalLead("org_default", "MAGICBRICKS", commercialRentEnquiry, { raw: 4 });
    const leadData = leadCreate.mock.calls[0][0].data;
    expect(leadData.preferredBhk).toBeNull();
    expect(leadData.assetClass).toBe("COMMERCIAL");
    expect(leadData.commercialPropertyType).toBe("OFFICE_SPACE");
  });

  it("never assigns a commercial property type to a residential portal lead", async () => {
    await ingestPortalLead("org_default", "HOUSING", residentialRentEnquiry, { raw: 5 });
    const leadData = leadCreate.mock.calls[0][0].data;
    expect(leadData.commercialPropertyType).toBeNull();
    expect(leadData.preferredBhk).toBe(2);
  });

  it("maps a sale enquiry to the BUY requirement type", async () => {
    await ingestPortalLead("org_default", "OLX", { ...residentialRentEnquiry, transactionType: "SALE" }, { raw: 6 });
    const leadData = leadCreate.mock.calls[0][0].data;
    expect(leadData.requirementType).toBe("BUY");
    expect(leadData.transactionType).toBe("SALE");
  });
});

describe("existing lead match", () => {
  beforeEach(() => leadFindMany.mockResolvedValue([{ id: "lead-existing", clientName: "Portal Client" }]));

  it("links the event to the existing lead instead of creating a duplicate", async () => {
    const result = await ingestPortalLead("org_default", "HOUSING", residentialRentEnquiry, { raw: 7 });
    expect(result.status).toBe("MATCHED_EXISTING");
    expect(leadCreate).not.toHaveBeenCalled();
    expect(eventCreate.mock.calls[0][0].data).toMatchObject({ leadId: "lead-existing", ingestionStatus: "MATCHED_EXISTING" });
  });

  it("preserves the original portal enquiry rather than overwriting the lead", async () => {
    await ingestPortalLead("org_default", "HOUSING", residentialRentEnquiry, { raw: 8 });
    const eventData = eventCreate.mock.calls[0][0].data;
    expect(eventData.externalLeadId).toBe("HSG-LEAD-1");
    expect(eventData.externalEventId).toBe("HSG-EVT-1");
    expect(eventData.message).toBe("Interested in this flat");
    // The linked lead is never mutated by ingestion - only the event is written.
    expect(eventUpdate).not.toHaveBeenCalled();
  });

  it("keeps every enquiry as its own event so history accumulates", async () => {
    await ingestPortalLead("org_default", "HOUSING", { ...residentialRentEnquiry, externalEventId: "HSG-EVT-2" }, { raw: 9 });
    await ingestPortalLead("org_default", "HOUSING", { ...residentialRentEnquiry, externalEventId: "HSG-EVT-3" }, { raw: 10 });
    expect(eventCreate).toHaveBeenCalledTimes(2);
  });
});

describe("ambiguous contact", () => {
  beforeEach(() =>
    leadFindMany.mockResolvedValue([
      { id: "lead-a", clientName: "Portal Client" },
      { id: "lead-b", clientName: "Portal Client (office)" },
    ])
  );

  it("holds the event for review and never auto-merges", async () => {
    const result = await ingestPortalLead("org_default", "HOUSING", residentialRentEnquiry, { raw: 11 });
    expect(result.status).toBe("AMBIGUOUS");
    expect(leadCreate).not.toHaveBeenCalled();
    expect(eventCreate.mock.calls[0][0].data).toMatchObject({ leadId: null, ingestionStatus: "AMBIGUOUS" });
  });

  it("returns the candidate set so a human can choose", async () => {
    const result = await ingestPortalLead("org_default", "HOUSING", residentialRentEnquiry, { raw: 12 });
    expect(result.candidates?.map((c) => c.id)).toEqual(["lead-a", "lead-b"]);
  });

  it("does not treat the same lead returned twice as ambiguous", async () => {
    leadFindMany.mockResolvedValue([
      { id: "lead-a", clientName: "Portal Client" },
      { id: "lead-a", clientName: "Portal Client" },
    ]);
    const result = await ingestPortalLead("org_default", "HOUSING", residentialRentEnquiry, { raw: 13 });
    expect(result.status).toBe("MATCHED_EXISTING");
  });
});

describe("duplicate / replayed events", () => {
  it("is idempotent on a replayed external event id", async () => {
    eventFindUnique.mockResolvedValue({ id: "evt-existing", ingestionStatus: "RECEIVED" });
    const result = await ingestPortalLead("org_default", "HOUSING", residentialRentEnquiry, { raw: 14 });
    expect(result.status).toBe("DUPLICATE");
    expect(eventCreate).not.toHaveBeenCalled();
    expect(leadCreate).not.toHaveBeenCalled();
  });

  it("falls back to the raw payload hash when the provider sends no event id", async () => {
    eventFindFirst.mockResolvedValue({ id: "evt-existing" });
    const result = await ingestPortalLead("org_default", "OLX", { ...residentialRentEnquiry, externalEventId: undefined }, { raw: 15 });
    expect(result.status).toBe("DUPLICATE");
    expect(eventFindUnique).not.toHaveBeenCalled();
    expect(leadCreate).not.toHaveBeenCalled();
  });

  it("scopes the duplicate lookup to the organization and provider", async () => {
    await ingestPortalLead("org_default", "HOUSING", residentialRentEnquiry, { raw: 16 });
    expect(eventFindUnique.mock.calls[0][0].where.organizationId_provider_externalEventId).toMatchObject({
      organizationId: "org_default",
      provider: "HOUSING",
      externalEventId: "HSG-EVT-1",
    });
  });

  it("scopes candidate lookup to the organization so leads never cross tenants", async () => {
    await ingestPortalLead("org_other", "HOUSING", residentialRentEnquiry, { raw: 17 });
    expect(leadFindMany.mock.calls[0][0].where.organizationId).toBe("org_other");
  });
});

describe("identity signals", () => {
  it("looks up by provider lead id, phone and email", async () => {
    await ingestPortalLead("org_default", "HOUSING", residentialRentEnquiry, { raw: 18 });
    const or = leadFindMany.mock.calls[0][0].where.OR;
    expect(or).toContainEqual({ portalProvider: "HOUSING", externalLeadId: "HSG-LEAD-1" });
    expect(or.some((f: Record<string, unknown>) => "phone" in f)).toBe(true);
    expect(or).toContainEqual({ email: { equals: "portal.client@example.com", mode: "insensitive" } });
  });

  it("creates a clearly-unverified placeholder phone when the provider masks the number", async () => {
    await ingestPortalLead("org_default", "HOUSING", { ...residentialRentEnquiry, phone: undefined, email: undefined }, { raw: 19 });
    expect(leadCreate.mock.calls[0][0].data.phone).toBe("UNVERIFIED-PORTAL");
  });

  it("does not query for candidates at all when no identity signal exists", async () => {
    await ingestPortalLead("org_default", "HOUSING", { ...residentialRentEnquiry, externalLeadId: undefined, phone: undefined, email: undefined }, { raw: 20 });
    expect(leadFindMany).not.toHaveBeenCalled();
  });
});
