import { describe, it, expect } from "vitest";
import { parseOlxLeadDate, deriveOlxEventId, mapOlxLead } from "./adapter";
import type { OlxLeadPayload, OlxAdSnapshot } from "./schema";

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

/**
 * Per the task's documented contract, "OLX lead fields" (name/phoneNumber/
 * emailId/date/adId) and "OLX ad data" (id/title/desc/price/lat/long/
 * parameters) are two separate lists, correlated by `ad.id === lead.adId`.
 * mapOlxLead() takes the correlated ad as an explicit second argument - it
 * is never read off the lead object (there is no `lead.ad` field).
 */
function lead(overrides: Partial<OlxLeadPayload> = {}): OlxLeadPayload {
  return {
    name: "Ramesh Kumar",
    phoneNumber: "+91 98111 00099",
    emailId: "ramesh@example.com",
    date: "04/03/26",
    adId: "olx-ad-123",
    leadId: "olx-lead-999",
    id: undefined,
    ...overrides,
  };
}

function ad(overrides: Partial<OlxAdSnapshot> = {}): OlxAdSnapshot {
  return {
    id: "olx-ad-123",
    title: "2BHK Flat in Rajouri Garden",
    desc: "Spacious flat",
    price: 45000,
    lat: 28.5,
    long: 77.1,
    parameters: { locality: "Rajouri Garden", category: "Residential", adType: "Rent", bhk: "2 BHK" },
    ...overrides,
  };
}

describe("mapOlxLead", () => {
  it("normalizes a +91-prefixed phone number", () => {
    const { canonical } = mapOlxLead(lead(), ad());
    expect(canonical.phone).toBe("919811100099");
  });

  it("handles a null email without throwing", () => {
    const { canonical } = mapOlxLead(lead({ emailId: null }), ad());
    expect(canonical.email).toBeUndefined();
  });

  it("maps adId to externalListingId for property matching", () => {
    const { canonical } = mapOlxLead(lead(), ad());
    expect(canonical.externalListingId).toBe("olx-ad-123");
  });

  it("prefers OLX's own stable leadId over a derived hash", () => {
    const { canonical } = mapOlxLead(lead(), ad());
    expect(canonical.externalLeadId).toBe("olx-lead-999");
    expect(canonical.externalEventId).toBe("olx-lead-999");
  });

  it("falls back to a derived olx: event id when no stable id is present", () => {
    const { canonical } = mapOlxLead(lead({ leadId: undefined, id: undefined }), ad());
    expect(canonical.externalLeadId).toBeUndefined();
    expect(canonical.externalEventId).toMatch(/^olx:[a-f0-9]{64}$/);
  });

  it("infers locality, transaction type and BHK from the correlated ad's parameters", () => {
    const { canonical } = mapOlxLead(lead(), ad());
    expect(canonical.locality).toBe("Rajouri Garden");
    expect(canonical.transactionType).toBe("RENT");
    expect(canonical.assetClass).toBe("RESIDENTIAL");
    expect(canonical.bhk).toBe(2);
  });

  it("defaults to RESIDENTIAL/SALE and flags for review when the correlated ad has no parameters", () => {
    const { canonical, needsReview, reviewReasons } = mapOlxLead(lead(), ad({ title: null, desc: null, price: null, lat: null, long: null, parameters: null }));
    expect(canonical.assetClass).toBe("RESIDENTIAL");
    expect(canonical.transactionType).toBe("SALE");
    expect(needsReview).toBe(true);
    expect(reviewReasons.length).toBeGreaterThan(0);
  });

  it("still ingests a lead with NO correlated ad data at all (adId absent from the ads array) - never blocks ingestion", () => {
    const { canonical, needsReview, reviewReasons } = mapOlxLead(lead(), null);
    expect(canonical.name).toBe("Ramesh Kumar");
    expect(canonical.phone).toBe("919811100099");
    expect(canonical.externalListingId).toBe("olx-ad-123");
    expect(canonical.locality).toBe("Unknown (OLX)");
    expect(canonical.assetClass).toBe("RESIDENTIAL");
    expect(canonical.transactionType).toBe("SALE");
    expect(canonical.minBudget).toBe(0);
    expect(canonical.maxBudget).toBe(0);
    expect(needsReview).toBe(true);
    expect(reviewReasons.some((r) => r.includes("no ad data was returned"))).toBe(true);
  });

  it("behaves identically whether correlatedAd is explicitly null or simply omitted", () => {
    const withNull = mapOlxLead(lead());
    const withOmitted = mapOlxLead(lead(), undefined);
    expect(withNull.canonical).toEqual(withOmitted.canonical);
  });

  it("records whether an ad was correlated on the staff-facing snapshot", () => {
    expect(mapOlxLead(lead(), ad()).snapshot.adCorrelated).toBe(true);
    expect(mapOlxLead(lead(), null).snapshot.adCorrelated).toBe(false);
  });

  it("never leaks GPS coordinates into the staff-facing snapshot", () => {
    const { snapshot } = mapOlxLead(lead(), ad());
    expect(JSON.stringify(snapshot)).not.toContain("28.5");
    expect(JSON.stringify(snapshot)).not.toContain("77.1");
    expect(snapshot).not.toHaveProperty("lat");
    expect(snapshot).not.toHaveProperty("long");
  });

  it("uses ad price as both min and max budget when only a single price is given", () => {
    const { canonical } = mapOlxLead(lead(), ad());
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
