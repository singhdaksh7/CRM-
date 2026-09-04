import { describe, it, expect } from "vitest";
import { parseOlxLeadDate, deriveOlxEventId, mapOlxLead } from "./adapter";
import type { OlxLeadPayload } from "./schema";

describe("parseOlxLeadDate", () => {
  it("parses DD/MM/YY unambiguously", () => {
    const date = parseOlxLeadDate("05/03/26");
    expect(date?.getUTCFullYear()).toBe(2026);
    expect(date?.getUTCMonth()).toBe(2); // March = index 2
    expect(date?.getUTCDate()).toBe(5);
  });

  it("never confuses day and month (05/03 is 5 March, not 3 May)", () => {
    const date = parseOlxLeadDate("05/03/26");
    expect(date?.getUTCMonth()).toBe(2);
    expect(date?.getUTCDate()).toBe(5);
  });

  it("accepts a 4-digit year", () => {
    const date = parseOlxLeadDate("15/07/2026");
    expect(date?.getUTCFullYear()).toBe(2026);
  });

  it("applies the 70/30 pivot for a 2-digit year", () => {
    expect(parseOlxLeadDate("01/01/24")?.getUTCFullYear()).toBe(2024);
    expect(parseOlxLeadDate("01/01/95")?.getUTCFullYear()).toBe(1995);
  });

  it("rejects an impossible calendar date instead of silently rolling it forward", () => {
    expect(parseOlxLeadDate("31/02/26")).toBeNull();
  });

  it("rejects a non-DD/MM/YY string", () => {
    expect(parseOlxLeadDate("2026-03-05")).toBeNull();
    expect(parseOlxLeadDate("not a date")).toBeNull();
  });
});

function lead(overrides: Partial<OlxLeadPayload> = {}): OlxLeadPayload {
  return {
    name: "Ramesh Kumar",
    phoneNumber: "+91 98111 00099",
    emailId: "ramesh@example.com",
    date: "04/03/26",
    adId: "olx-ad-123",
    leadId: "olx-lead-999",
    id: undefined,
    ad: { id: "olx-ad-123", title: "2BHK Flat in Rajouri Garden", desc: "Spacious flat", price: 45000, lat: 28.5, long: 77.1, parameters: { locality: "Rajouri Garden", category: "Residential", adType: "Rent", bhk: "2 BHK" } },
    ...overrides,
  };
}

describe("mapOlxLead", () => {
  it("normalizes a +91-prefixed phone number", () => {
    const { canonical } = mapOlxLead(lead());
    expect(canonical.phone).toBe("919811100099");
  });

  it("handles a null email without throwing", () => {
    const { canonical } = mapOlxLead(lead({ emailId: null }));
    expect(canonical.email).toBeUndefined();
  });

  it("maps adId to externalListingId for property matching", () => {
    const { canonical } = mapOlxLead(lead());
    expect(canonical.externalListingId).toBe("olx-ad-123");
  });

  it("prefers OLX's own stable leadId over a derived hash", () => {
    const { canonical } = mapOlxLead(lead());
    expect(canonical.externalLeadId).toBe("olx-lead-999");
    expect(canonical.externalEventId).toBe("olx-lead-999");
  });

  it("falls back to a derived olx: event id when no stable id is present", () => {
    const { canonical } = mapOlxLead(lead({ leadId: undefined, id: undefined }));
    expect(canonical.externalLeadId).toBeUndefined();
    expect(canonical.externalEventId).toMatch(/^olx:[a-f0-9]{64}$/);
  });

  it("infers locality, transaction type and BHK from the ad parameters", () => {
    const { canonical } = mapOlxLead(lead());
    expect(canonical.locality).toBe("Rajouri Garden");
    expect(canonical.transactionType).toBe("RENT");
    expect(canonical.assetClass).toBe("RESIDENTIAL");
    expect(canonical.bhk).toBe(2);
  });

  it("defaults to RESIDENTIAL/SALE and flags for review when parameters are absent", () => {
    const { canonical, needsReview, reviewReasons } = mapOlxLead(lead({ ad: { id: "ad-x", title: null, desc: null, price: null, lat: null, long: null, parameters: null } }));
    expect(canonical.assetClass).toBe("RESIDENTIAL");
    expect(canonical.transactionType).toBe("SALE");
    expect(needsReview).toBe(true);
    expect(reviewReasons.length).toBeGreaterThan(0);
  });

  it("never leaks GPS coordinates into the staff-facing snapshot", () => {
    const { snapshot } = mapOlxLead(lead());
    expect(JSON.stringify(snapshot)).not.toContain("28.5");
    expect(JSON.stringify(snapshot)).not.toContain("77.1");
    expect(snapshot).not.toHaveProperty("lat");
    expect(snapshot).not.toHaveProperty("long");
  });

  it("uses ad price as both min and max budget when only a single price is given", () => {
    const { canonical } = mapOlxLead(lead());
    expect(canonical.minBudget).toBe(45000);
    expect(canonical.maxBudget).toBe(45000);
  });
});

describe("deriveOlxEventId", () => {
  it("is deterministic for the same adId/phone/date", () => {
    const payload = lead({ leadId: undefined, id: undefined });
    const a = deriveOlxEventId(payload, "919811100099");
    const b = deriveOlxEventId(payload, "919811100099");
    expect(a).toBe(b);
    expect(a).toMatch(/^olx:/);
  });

  it("differs for a different adId", () => {
    const a = deriveOlxEventId(lead({ adId: "ad-1" }), "919811100099");
    const b = deriveOlxEventId(lead({ adId: "ad-2" }), "919811100099");
    expect(a).not.toBe(b);
  });
});
