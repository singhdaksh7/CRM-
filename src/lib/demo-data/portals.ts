/**
 * Deterministic, MOCK-only property-portal demo scenarios.
 *
 * Every provider in the registry is contract-only (see
 * src/integrations/property-portals/registry.ts): no credentials exist, no
 * endpoint is ever called. This module therefore creates only *local* rows
 * describing what a connected portal WOULD look like - connection records
 * with truthful non-connected statuses, external lead events in each
 * ingestion state, listings, and a retry/dead-letter operation ledger.
 *
 * Contract, matching the rest of src/lib/demo-data:
 *  - deterministic ids via demoId(), so re-seeding is stable and idempotent
 *  - every row organization-scoped to DEMO_ORGANIZATION_ID
 *  - every row demo-prefixed so teardown.ts removes exactly these and
 *    nothing else
 *  - zero network calls, zero real credentials, zero provider requests
 */
import type { Lead, Property, User } from "@prisma/client";
import { prisma } from "../prisma";
import { DEMO_ORGANIZATION_ID, demoCode, demoId, demoPhone } from "./constants";

export const DEMO_PORTAL_PROVIDERS = ["HOUSING", "OLX", "MAGICBRICKS", "NINETY_NINE_ACRES", "META", "OTHER"] as const;
export type DemoPortalProvider = (typeof DEMO_PORTAL_PROVIDERS)[number];

/**
 * One connection per provider. Statuses are deliberately truthful: none of
 * these providers has an authorized integration, so none is CONNECTED and
 * none carries a credential. `credentialReference` stays null everywhere -
 * the demo must never imply a stored secret exists.
 */
export const DEMO_PORTAL_CONNECTIONS = [
  { index: 1, provider: "HOUSING", status: "PARTNER_ACCESS_REQUIRED", connectionMode: "MANUAL", displayName: "Housing (demo)", lastErrorSummary: "Official partner API access has not been granted." },
  { index: 2, provider: "NINETY_NINE_ACRES", status: "PARTNER_ACCESS_REQUIRED", connectionMode: "MANUAL", displayName: "99acres (demo)", lastErrorSummary: "Official partner API access has not been granted." },
  { index: 3, provider: "MAGICBRICKS", status: "NOT_CONFIGURED", connectionMode: "CSV", displayName: "MagicBricks (demo)", lastErrorSummary: null },
  { index: 4, provider: "OLX", status: "NOT_CONFIGURED", connectionMode: "EMAIL", displayName: "OLX (demo)", lastErrorSummary: null },
  { index: 5, provider: "META", status: "NOT_CONFIGURED", connectionMode: "MANUAL", displayName: "Meta (demo)", lastErrorSummary: "Official provider access has not been granted." },
  { index: 6, provider: "OTHER", status: "NOT_CONFIGURED", connectionMode: "MANUAL", displayName: "Other portal (demo)", lastErrorSummary: null },
] as const;

/**
 * Commercial inventory - the residential demo builders (properties.ts) only
 * produce RESIDENTIAL stock, so the commercial business lines would
 * otherwise have nothing to show. One rental and one sale, both with
 * bhk/bathrooms = 0 exactly like real commercial records.
 */
export const DEMO_PORTAL_COMMERCIAL_PROPERTIES = [
  {
    index: 9001, listingType: "RENT", propertyType: "COMMERCIAL_OFFICE", area: "Rajouri Garden",
    title: "Fitted office floor in Rajouri Garden", monthlyRent: 190000, salePrice: null,
    builtUpAreaSqft: 2400, workstations: 40, cabins: 4, commercialFitOut: "FURNISHED",
  },
  {
    index: 9002, listingType: "SALE", propertyType: "COMMERCIAL_SHOP", area: "Karol Bagh",
    title: "High-street retail shop in Karol Bagh", monthlyRent: null, salePrice: 19000000,
    builtUpAreaSqft: 900, workstations: null, cabins: null, commercialFitOut: "BARE_SHELL",
  },
] as const;

/**
 * Portal-originated leads, one per provider, spanning both asset classes and
 * both transaction types. `source` mirrors what ingestion.ts derives from the
 * provider so the demo Leads workspace shows the same provenance a real
 * ingestion would produce.
 */
export const DEMO_PORTAL_LEADS = [
  { index: 9001, provider: "HOUSING", source: "HOUSING_COM", clientName: "Housing Portal Enquiry", assetClass: "RESIDENTIAL", transactionType: "RENT", requirementType: "RENT", preferredLocation: "Rajouri Garden", minBudget: 25000, maxBudget: 35000, preferredBhk: 2, commercialPropertyType: null, externalLeadId: "DEMO-HSG-LEAD-0001" },
  { index: 9002, provider: "NINETY_NINE_ACRES", source: "ACRES_99", clientName: "99acres Portal Enquiry", assetClass: "RESIDENTIAL", transactionType: "SALE", requirementType: "BUY", preferredLocation: "Dwarka", minBudget: 7500000, maxBudget: 9500000, preferredBhk: 3, commercialPropertyType: null, externalLeadId: "DEMO-99A-LEAD-0001" },
  { index: 9003, provider: "MAGICBRICKS", source: "MAGICBRICKS", clientName: "MagicBricks Commercial Enquiry", assetClass: "COMMERCIAL", transactionType: "RENT", requirementType: "RENT", preferredLocation: "Rajouri Garden", minBudget: 170000, maxBudget: 210000, preferredBhk: null, commercialPropertyType: "COMMERCIAL_OFFICE", externalLeadId: "DEMO-MB-LEAD-0001" },
  { index: 9004, provider: "OLX", source: "MANUAL", clientName: "OLX Portal Enquiry", assetClass: "RESIDENTIAL", transactionType: "SALE", requirementType: "BUY", preferredLocation: "Janakpuri", minBudget: 6000000, maxBudget: 8000000, preferredBhk: 2, commercialPropertyType: null, externalLeadId: "DEMO-OLX-LEAD-0001" },
  { index: 9005, provider: "META", source: "META", clientName: "Meta Portal Enquiry", assetClass: "COMMERCIAL", transactionType: "SALE", requirementType: "BUY", preferredLocation: "Karol Bagh", minBudget: 17000000, maxBudget: 21000000, preferredBhk: null, commercialPropertyType: "COMMERCIAL_SHOP", externalLeadId: "DEMO-META-LEAD-0001" },
  { index: 9006, provider: "OTHER", source: "OTHER", clientName: "Other Portal Enquiry", assetClass: "RESIDENTIAL", transactionType: "RENT", requirementType: "RENT", preferredLocation: "Janakpuri", minBudget: 30000, maxBudget: 45000, preferredBhk: 2, commercialPropertyType: null, externalLeadId: "DEMO-OTHER-LEAD-0001" },
] as const;

/**
 * Every ingestion outcome the review workflow has to handle. `leadIndex`
 * points at DEMO_PORTAL_LEADS above; a null leadIndex means the event is
 * deliberately unlinked (ambiguous / failed) and awaits a human decision.
 */
export const DEMO_PORTAL_EVENTS = [
  { index: 1, provider: "HOUSING", connectionIndex: 1, leadIndex: 9001, ingestionStatus: "RECEIVED", externalEventId: "DEMO-HSG-EVT-0001", scenario: "NEW_PORTAL_LEAD", failureReason: null, attemptCount: 1 },
  { index: 2, provider: "NINETY_NINE_ACRES", connectionIndex: 2, leadIndex: 9002, ingestionStatus: "RECEIVED", externalEventId: "DEMO-99A-EVT-0001", scenario: "NEW_PORTAL_LEAD", failureReason: null, attemptCount: 1 },
  { index: 3, provider: "MAGICBRICKS", connectionIndex: 3, leadIndex: 9003, ingestionStatus: "RECEIVED", externalEventId: "DEMO-MB-EVT-0001", scenario: "NEW_PORTAL_LEAD", failureReason: null, attemptCount: 1 },
  { index: 4, provider: "OLX", connectionIndex: 4, leadIndex: 9004, ingestionStatus: "RECEIVED", externalEventId: "DEMO-OLX-EVT-0001", scenario: "NEW_PORTAL_LEAD", failureReason: null, attemptCount: 1 },
  { index: 5, provider: "META", connectionIndex: 5, leadIndex: 9005, ingestionStatus: "RECEIVED", externalEventId: "DEMO-META-EVT-0001", scenario: "NEW_PORTAL_LEAD", failureReason: null, attemptCount: 1 },
  { index: 10, provider: "OTHER", connectionIndex: 6, leadIndex: 9006, ingestionStatus: "RECEIVED", externalEventId: "DEMO-OTHER-EVT-0001", scenario: "NEW_PORTAL_LEAD", failureReason: null, attemptCount: 1 },
  { index: 6, provider: "HOUSING", connectionIndex: 1, leadIndex: 9001, ingestionStatus: "MATCHED_EXISTING", externalEventId: "DEMO-HSG-EVT-0002", scenario: "EXISTING_LEAD_MATCH", failureReason: null, attemptCount: 1 },
  { index: 7, provider: "HOUSING", connectionIndex: 1, leadIndex: null, ingestionStatus: "AMBIGUOUS", externalEventId: "DEMO-HSG-EVT-0003", scenario: "AMBIGUOUS_CONTACT", failureReason: null, attemptCount: 1 },
  { index: 8, provider: "HOUSING", connectionIndex: 1, leadIndex: 9001, ingestionStatus: "DUPLICATE", externalEventId: "DEMO-HSG-EVT-0004", scenario: "DUPLICATE_EVENT", failureReason: null, attemptCount: 2 },
  { index: 9, provider: "MAGICBRICKS", connectionIndex: 3, leadIndex: null, ingestionStatus: "FAILED", externalEventId: "DEMO-MB-EVT-0002", scenario: "FAILED_INGESTION", failureReason: "Payload could not be canonicalized: required locality field was absent.", attemptCount: 3 },
] as const;

/** Portal listings, including one parked in SYNC_CONFLICT for the conflict review UI. */
export const DEMO_PORTAL_LISTINGS = [
  { index: 1, provider: "HOUSING", connectionIndex: 1, propertyIndex: 9001, status: "PUBLISHED", scenario: "PUBLISHED_LISTING", conflictFields: null },
  { index: 2, provider: "MAGICBRICKS", connectionIndex: 3, propertyIndex: 9001, status: "SYNC_CONFLICT", scenario: "LISTING_CONFLICT", conflictFields: ["price", "availability"] },
  { index: 3, provider: "NINETY_NINE_ACRES", connectionIndex: 2, propertyIndex: 9002, status: "DRAFT", scenario: "CAPABILITY_BLOCKED", conflictFields: null },
] as const;

/** Operation ledger: a retryable failure, an exhausted dead letter, and a capability-blocked publish attempt. */
export const DEMO_PORTAL_OPERATIONS = [
  { index: 1, provider: "MAGICBRICKS", connectionIndex: 3, listingIndex: 2, operationType: "UPDATE_LISTING", status: "RETRYABLE", attemptCount: 1, failureReason: "Simulated transient failure - safe to retry.", scenario: "RETRYABLE_OPERATION", retryOffsetMinutes: -5 },
  { index: 2, provider: "OLX", connectionIndex: 4, listingIndex: null, operationType: "PULL_LEADS", status: "DEAD_LETTER", attemptCount: 3, failureReason: "Retry budget exhausted after 3 attempts.", scenario: "DEAD_LETTER_OPERATION", retryOffsetMinutes: null },
  { index: 3, provider: "NINETY_NINE_ACRES", connectionIndex: 2, listingIndex: 3, operationType: "PUBLISH_LISTING", status: "PENDING", attemptCount: 0, failureReason: "Blocked: supportsListingPublish is PARTNER_ACCESS_REQUIRED. No request was made.", scenario: "CAPABILITY_BLOCKED_OPERATION", retryOffsetMinutes: null },
] as const;

/** Every scenario this module guarantees exists after a seed - asserted by tests and by verify. */
export const DEMO_PORTAL_SCENARIOS = [
  "NEW_PORTAL_LEAD",
  "EXISTING_LEAD_MATCH",
  "AMBIGUOUS_CONTACT",
  "DUPLICATE_EVENT",
  "FAILED_INGESTION",
  "RETRYABLE_OPERATION",
  "DEAD_LETTER_OPERATION",
  "CAPABILITY_BLOCKED_OPERATION",
  "PUBLISHED_LISTING",
  "LISTING_CONFLICT",
  "CAPABILITY_BLOCKED",
] as const;

/** Deterministic counts, so plan.ts, verify and the dry-run never drift from this file. */
export const DEMO_PORTAL_COUNTS = {
  connections: DEMO_PORTAL_CONNECTIONS.length,
  commercialProperties: DEMO_PORTAL_COMMERCIAL_PROPERTIES.length,
  leads: DEMO_PORTAL_LEADS.length,
  events: DEMO_PORTAL_EVENTS.length,
  listings: DEMO_PORTAL_LISTINGS.length,
  operations: DEMO_PORTAL_OPERATIONS.length,
} as const;

/** Fixed timestamp base so every derived date is deterministic across runs of the same seed. */
const BASE_TIME = new Date("2026-08-17T09:00:00.000Z");
const minutes = (n: number) => new Date(BASE_TIME.getTime() + n * 60_000);

export interface DemoPortalResult {
  connections: number;
  commercialProperties: number;
  leads: number;
  events: number;
  listings: number;
  operations: number;
  scenarios: readonly string[];
}

/**
 * Persists every portal scenario. Purely local writes - this function never
 * performs a network request and never stores a credential.
 */
export async function createDemoPortalScenarios(actor: User): Promise<DemoPortalResult> {
  const organizationId = DEMO_ORGANIZATION_ID;

  for (const connection of DEMO_PORTAL_CONNECTIONS) {
    const data = {
      organizationId,
      provider: connection.provider,
      status: connection.status,
      connectionMode: connection.connectionMode,
      displayName: connection.displayName,
      accountReference: demoCode("PORTAL", connection.index),
      // Deliberately null: no demo row may imply a stored provider secret.
      credentialReference: null,
      config: "{}",
      lastErrorSummary: connection.lastErrorSummary,
      lastErrorAt: connection.lastErrorSummary ? minutes(-60) : null,
      createdById: actor.id,
    };
    await prisma.propertyPortalConnection.upsert({
      where: { id: demoId("portal-conn", connection.index) },
      update: data,
      create: { id: demoId("portal-conn", connection.index), ...data },
    });
  }

  const properties: Property[] = [];
  for (const spec of DEMO_PORTAL_COMMERCIAL_PROPERTIES) {
    const data = {
      organizationId,
      propertyCode: demoCode("PROP", spec.index),
      title: spec.title,
      propertyType: spec.propertyType,
      listingType: spec.listingType,
      assetClass: "COMMERCIAL" as const,
      status: "AVAILABLE" as const,
      description: "Deterministic commercial demo inventory. No portal was contacted to create this record.",
      city: "Delhi",
      area: spec.area,
      address: `${spec.area} Commercial Complex, Delhi`,
      monthlyRent: spec.monthlyRent,
      salePrice: spec.salePrice,
      // Commercial records legitimately carry no BHK/bathroom count.
      bhk: 0,
      bathrooms: 0,
      furnishing: "UNFURNISHED" as const,
      builtUpAreaSqft: spec.builtUpAreaSqft,
      workstations: spec.workstations,
      cabins: spec.cabins,
      commercialFitOut: spec.commercialFitOut,
      parkingAvailable: true,
      liftAvailable: true,
      ownerName: "KP Demo Commercial Owner",
      ownerPhone: demoPhone(spec.index),
      createdById: actor.id,
    };
    properties.push(
      await prisma.property.upsert({
        where: { id: demoId("prop", spec.index) },
        update: data,
        create: { id: demoId("prop", spec.index), ...data },
      })
    );
  }

  const leads: Lead[] = [];
  for (const spec of DEMO_PORTAL_LEADS) {
    const data = {
      organizationId,
      leadCode: demoCode("LEAD", spec.index),
      clientName: spec.clientName,
      phone: demoPhone(spec.index, 3),
      email: null,
      source: spec.source,
      assetClass: spec.assetClass,
      transactionType: spec.transactionType,
      requirementType: spec.requirementType,
      portalProvider: spec.provider,
      externalLeadId: spec.externalLeadId,
      externalListingId: null,
      rawPayloadHash: null,
      receivedAt: minutes(-30),
      preferredLocation: spec.preferredLocation,
      minBudget: spec.minBudget,
      maxBudget: spec.maxBudget,
      preferredBhk: spec.preferredBhk,
      commercialPropertyType: spec.commercialPropertyType,
      status: "NEW" as const,
      priority: "WARM" as const,
    };
    leads.push(
      await prisma.lead.upsert({
        where: { id: demoId("lead", spec.index) },
        update: data,
        create: { id: demoId("lead", spec.index), ...data },
      })
    );
  }

  for (const spec of DEMO_PORTAL_EVENTS) {
    const data = {
      organizationId,
      connectionId: demoId("portal-conn", spec.connectionIndex),
      leadId: spec.leadIndex === null ? null : demoId("lead", spec.leadIndex),
      provider: spec.provider,
      externalLeadId: spec.leadIndex === null ? null : DEMO_PORTAL_LEADS.find((l) => l.index === spec.leadIndex)!.externalLeadId,
      externalEventId: spec.externalEventId,
      externalListingId: null,
      receivedAt: minutes(-spec.index * 10),
      message: `Deterministic ${spec.scenario} demo enquiry. No provider was contacted.`,
      // A stable hash of the scenario, not of any real provider payload.
      rawPayloadHash: `demo-${spec.externalEventId.toLowerCase()}`,
      ingestionStatus: spec.ingestionStatus,
      failureReason: spec.failureReason,
      attemptCount: spec.attemptCount,
      lastAttemptAt: minutes(-spec.index * 10),
    };
    await prisma.externalLeadEvent.upsert({
      where: { id: demoId("portal-evt", spec.index) },
      update: data,
      create: { id: demoId("portal-evt", spec.index), ...data },
    });
  }

  for (const spec of DEMO_PORTAL_LISTINGS) {
    const data = {
      organizationId,
      connectionId: demoId("portal-conn", spec.connectionIndex),
      propertyId: demoId("prop", spec.propertyIndex),
      provider: spec.provider,
      externalListingId: `DEMO-${spec.provider}-LST-${String(spec.index).padStart(4, "0")}`,
      externalUrl: null,
      status: spec.status,
      publishedAt: spec.status === "DRAFT" ? null : minutes(-120),
      lastSyncedAt: spec.status === "DRAFT" ? null : minutes(-90),
      payloadHash: `demo-listing-${spec.index}`,
      errorSummary: spec.scenario === "CAPABILITY_BLOCKED" ? "Publishing requires official partner access; no request was made." : null,
      conflictFields: spec.conflictFields ? JSON.stringify(spec.conflictFields) : null,
      portalSnapshot: spec.conflictFields ? JSON.stringify({ price: 205000, status: "INACTIVE" }) : null,
      conflictDetectedAt: spec.conflictFields ? minutes(-45) : null,
      conflictResolution: null,
      conflictResolvedAt: null,
      conflictResolvedById: null,
    };
    await prisma.portalListing.upsert({
      where: { id: demoId("portal-listing", spec.index) },
      update: data,
      create: { id: demoId("portal-listing", spec.index), ...data },
    });
  }

  for (const spec of DEMO_PORTAL_OPERATIONS) {
    const data = {
      organizationId,
      connectionId: demoId("portal-conn", spec.connectionIndex),
      portalListingId: spec.listingIndex === null ? null : demoId("portal-listing", spec.listingIndex),
      provider: spec.provider,
      operationType: spec.operationType,
      idempotencyKey: `demo-portal-op-${spec.index}`,
      status: spec.status,
      failureReason: spec.failureReason,
      attemptCount: spec.attemptCount,
      lastAttemptAt: spec.attemptCount > 0 ? minutes(-spec.index * 15) : null,
      retryEligibleAt: spec.retryOffsetMinutes === null ? null : minutes(spec.retryOffsetMinutes),
    };
    await prisma.portalOperation.upsert({
      where: { id: demoId("portal-op", spec.index) },
      update: data,
      create: { id: demoId("portal-op", spec.index), ...data },
    });
  }

  return {
    connections: DEMO_PORTAL_CONNECTIONS.length,
    commercialProperties: properties.length,
    leads: leads.length,
    events: DEMO_PORTAL_EVENTS.length,
    listings: DEMO_PORTAL_LISTINGS.length,
    operations: DEMO_PORTAL_OPERATIONS.length,
    scenarios: DEMO_PORTAL_SCENARIOS,
  };
}
