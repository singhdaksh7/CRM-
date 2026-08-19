import { describe, expect, it } from "vitest";
import {
  DEMO_PORTAL_CONNECTIONS,
  DEMO_PORTAL_COMMERCIAL_PROPERTIES,
  DEMO_PORTAL_COUNTS,
  DEMO_PORTAL_EVENTS,
  DEMO_PORTAL_LEADS,
  DEMO_PORTAL_LISTINGS,
  DEMO_PORTAL_OPERATIONS,
  DEMO_PORTAL_PROVIDERS,
  DEMO_PORTAL_SCENARIOS,
} from "./portals";
import { DEMO_SEED_PLAN } from "./plan";
import { PROPERTY_PORTAL_PROVIDERS } from "../../integrations/property-portals/registry";

describe("portal demo coverage", () => {
  it("has exactly one connection per registry provider", () => {
    expect([...DEMO_PORTAL_CONNECTIONS].map((c) => c.provider).sort()).toEqual([...PROPERTY_PORTAL_PROVIDERS].sort());
  });

  it("has one portal-originated lead per provider", () => {
    expect([...DEMO_PORTAL_LEADS].map((l) => l.provider).sort()).toEqual([...DEMO_PORTAL_PROVIDERS].sort());
  });

  it("covers all four business lines across the portal leads", () => {
    const lines = DEMO_PORTAL_LEADS.map((l) => `${l.assetClass}_${l.transactionType}`);
    expect(lines).toContain("RESIDENTIAL_RENT");
    expect(lines).toContain("RESIDENTIAL_SALE");
    expect(lines).toContain("COMMERCIAL_RENT");
    expect(lines).toContain("COMMERCIAL_SALE");
  });

  it("covers every ingestion, listing and operation scenario the review UI has to handle", () => {
    const scenarios = new Set<string>([
      ...DEMO_PORTAL_EVENTS.map((e) => e.scenario),
      ...DEMO_PORTAL_LISTINGS.map((l) => l.scenario),
      ...DEMO_PORTAL_OPERATIONS.map((o) => o.scenario),
    ]);
    for (const scenario of DEMO_PORTAL_SCENARIOS) expect(scenarios.has(scenario)).toBe(true);
  });

  it("includes both a commercial rental and a commercial sale property", () => {
    expect(DEMO_PORTAL_COMMERCIAL_PROPERTIES.map((p) => p.listingType).sort()).toEqual(["RENT", "SALE"]);
  });

  it("includes at least one commercial requirement", () => {
    expect(DEMO_PORTAL_LEADS.filter((l) => l.assetClass === "COMMERCIAL").length).toBeGreaterThan(0);
  });

  it("includes a retryable and a dead-letter operation", () => {
    const statuses = DEMO_PORTAL_OPERATIONS.map((o) => o.status);
    expect(statuses).toContain("RETRYABLE");
    expect(statuses).toContain("DEAD_LETTER");
  });

  it("includes a listing parked in SYNC_CONFLICT", () => {
    expect(DEMO_PORTAL_LISTINGS.some((l) => l.status === "SYNC_CONFLICT" && l.conflictFields)).toBe(true);
  });
});

describe("portal demo truthfulness", () => {
  it("never claims a provider is CONNECTED - none has authorized access", () => {
    expect(DEMO_PORTAL_CONNECTIONS.map((c) => c.status as string)).not.toContain("CONNECTED");
  });

  it("only uses truthful non-connected connection statuses", () => {
    for (const connection of DEMO_PORTAL_CONNECTIONS) {
      expect(["NOT_CONFIGURED", "PARTNER_ACCESS_REQUIRED", "DEGRADED", "AUTH_FAILED"]).toContain(connection.status);
    }
  });

  it("never assigns a BHK to a commercial portal lead", () => {
    for (const lead of DEMO_PORTAL_LEADS.filter((l) => l.assetClass === "COMMERCIAL")) {
      expect(lead.preferredBhk).toBeNull();
      expect(lead.commercialPropertyType).not.toBeNull();
    }
  });

  it("never assigns a commercial property type to a residential portal lead", () => {
    for (const lead of DEMO_PORTAL_LEADS.filter((l) => l.assetClass === "RESIDENTIAL")) {
      expect(lead.commercialPropertyType).toBeNull();
    }
  });

  it("contains no URL, hostname, token or credential-looking string anywhere", () => {
    const serialized = JSON.stringify([
      DEMO_PORTAL_CONNECTIONS, DEMO_PORTAL_COMMERCIAL_PROPERTIES, DEMO_PORTAL_LEADS,
      DEMO_PORTAL_EVENTS, DEMO_PORTAL_LISTINGS, DEMO_PORTAL_OPERATIONS,
    ]);
    expect(serialized).not.toMatch(/https?:\/\//i);
    expect(serialized).not.toMatch(/api[_-]?key|secret|bearer|authorization|password|access[_-]?token/i);
    expect(serialized).not.toMatch(/housing\.com|99acres\.com|magicbricks\.com|olx\.in/i);
  });

  it("marks the capability-blocked operation as never having made a request", () => {
    const blocked = DEMO_PORTAL_OPERATIONS.find((o) => o.scenario === "CAPABILITY_BLOCKED_OPERATION");
    expect(blocked?.attemptCount).toBe(0);
    expect(blocked?.failureReason).toMatch(/No request was made/i);
  });
});

describe("portal demo determinism and teardown safety", () => {
  it("uses unique deterministic indexes within each entity set", () => {
    const unique = <T extends { index: number }>(rows: readonly T[]) => new Set(rows.map((r) => r.index)).size === rows.length;
    expect(unique(DEMO_PORTAL_CONNECTIONS)).toBe(true);
    expect(unique(DEMO_PORTAL_COMMERCIAL_PROPERTIES)).toBe(true);
    expect(unique(DEMO_PORTAL_LEADS)).toBe(true);
    expect(unique(DEMO_PORTAL_EVENTS)).toBe(true);
    expect(unique(DEMO_PORTAL_LISTINGS)).toBe(true);
    expect(unique(DEMO_PORTAL_OPERATIONS)).toBe(true);
  });

  it("uses unique external ids so re-seeding never violates a provider uniqueness constraint", () => {
    expect(new Set(DEMO_PORTAL_EVENTS.map((e) => e.externalEventId)).size).toBe(DEMO_PORTAL_EVENTS.length);
    expect(new Set(DEMO_PORTAL_LEADS.map((l) => l.externalLeadId)).size).toBe(DEMO_PORTAL_LEADS.length);
  });

  it("keeps commercial demo property indexes outside the generated residential range", () => {
    for (const spec of DEMO_PORTAL_COMMERCIAL_PROPERTIES) expect(spec.index).toBeGreaterThan(DEMO_SEED_PLAN.properties);
    for (const spec of DEMO_PORTAL_LEADS) expect(spec.index).toBeGreaterThan(DEMO_SEED_PLAN.leads);
  });

  it("only references connections, leads and listings that this module itself defines", () => {
    const connectionIndexes = new Set(DEMO_PORTAL_CONNECTIONS.map((c) => c.index));
    const leadIndexes = new Set(DEMO_PORTAL_LEADS.map((l) => l.index));
    const propertyIndexes = new Set(DEMO_PORTAL_COMMERCIAL_PROPERTIES.map((p) => p.index));
    const listingIndexes = new Set(DEMO_PORTAL_LISTINGS.map((l) => l.index));
    for (const event of DEMO_PORTAL_EVENTS) {
      expect(connectionIndexes.has(event.connectionIndex)).toBe(true);
      if (event.leadIndex !== null) expect(leadIndexes.has(event.leadIndex)).toBe(true);
    }
    for (const listing of DEMO_PORTAL_LISTINGS) {
      expect(connectionIndexes.has(listing.connectionIndex)).toBe(true);
      expect(propertyIndexes.has(listing.propertyIndex)).toBe(true);
    }
    for (const operation of DEMO_PORTAL_OPERATIONS) {
      expect(connectionIndexes.has(operation.connectionIndex)).toBe(true);
      if (operation.listingIndex !== null) expect(listingIndexes.has(operation.listingIndex)).toBe(true);
    }
  });

  it("leaves ambiguous and failed events unlinked so no lead is auto-merged", () => {
    for (const event of DEMO_PORTAL_EVENTS.filter((e) => e.ingestionStatus === "AMBIGUOUS" || e.ingestionStatus === "FAILED")) {
      expect(event.leadIndex).toBeNull();
    }
  });
});

describe("portal demo plan alignment", () => {
  it("matches the shared seed plan exactly, so dry-run and verify can never drift", () => {
    expect(DEMO_PORTAL_COUNTS).toEqual({
      connections: DEMO_SEED_PLAN.portalConnections,
      commercialProperties: DEMO_SEED_PLAN.portalCommercialProperties,
      leads: DEMO_SEED_PLAN.portalLeads,
      events: DEMO_SEED_PLAN.portalExternalLeadEvents,
      listings: DEMO_SEED_PLAN.portalListings,
      operations: DEMO_SEED_PLAN.portalOperations,
    });
  });
});
