import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Housing.com lead FILE import orchestration - the staff-upload counterpart
 * to the live Housing webhook. Uses the REAL ingestPortalLead (not mocked)
 * so these tests exercise the actual shared dedup/matching path, mirroring
 * src/integrations/property-portals/ingestion-provenance.test.ts's approach.
 */

const eventFindUnique = vi.fn();
const eventFindFirst = vi.fn();
const eventCreate = vi.fn();
const eventUpdate = vi.fn();
const leadFindMany = vi.fn();
const leadCreate = vi.fn();
const customerContactFindUnique = vi.fn();
const importJobCreate = vi.fn();
const importJobUpdate = vi.fn();
const importRecordCreateMany = vi.fn();

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
    customerContact: {
      findUnique: (...a: unknown[]) => customerContactFindUnique(...a),
    },
    importJob: {
      create: (...a: unknown[]) => importJobCreate(...a),
      update: (...a: unknown[]) => importJobUpdate(...a),
    },
    importRecord: {
      createMany: (...a: unknown[]) => importRecordCreateMany(...a),
    },
  },
}));

vi.mock("server-only", () => ({}));
const autoAssignLead = vi.fn();
vi.mock("@/lib/assignment", () => ({ autoAssignLead: (...a: unknown[]) => autoAssignLead(...a) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
const recordAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));
const logActivity = vi.fn();
vi.mock("@/lib/activity", () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));

// No WhatsApp/SMS/email module is mocked here at all - if runHousingImport
// (directly or transitively through ingestPortalLead/autoAssignLead) ever
// tried to reach a customer-communication send path, the missing mock would
// surface as an import/resolution failure, not a silent pass.

const { previewHousingImport, runHousingImport } = await import("./housing-import");

const ORG = "org-1";
const COLUMN_MAPPING = {
  "Lead Name": "Lead Name",
  "Lead Phone Number": "Lead Phone Number",
  "Lead Email": "Lead Email",
  Locality: "Locality",
  City: "City",
  "Property/Project ID": "Property/Project ID",
  "Lead Date": "Lead Date",
  Configuration: "Configuration",
  Price: "Price",
  "Service Type": "Service Type",
  "Property Type": "Property Type",
  Notes: "Notes",
  Address: "Address",
} as const;

function row(overrides: Record<string, string> = {}) {
  return {
    "Lead Name": "Ramesh Kumar",
    "Lead Phone Number": "9876543210",
    "Lead Email": "ramesh@example.com",
    Locality: "Janakpuri",
    City: "Delhi",
    "Property/Project ID": "PROJ-1",
    "Lead Date": "2026-08-15",
    Configuration: "3 BHK",
    Price: "85 lakh",
    "Service Type": "resale",
    "Property Type": "residential",
    Notes: "Wants parking",
    Address: "House 12, Sector 5",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  eventFindUnique.mockResolvedValue(null);
  eventFindFirst.mockResolvedValue(null);
  eventCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "event-1", ...data }));
  eventUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "event-1", ...data }));
  leadFindMany.mockResolvedValue([]);
  leadCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "lead-1", ...data }));
  customerContactFindUnique.mockResolvedValue(null);
  importJobCreate.mockResolvedValue({ id: "job-1" });
  importJobUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "job-1", ...data }));
  importRecordCreateMany.mockResolvedValue({ count: 0 });
  autoAssignLead.mockResolvedValue({ assigned: false, employeeId: null, strategy: null, reason: "no eligible executive" });
});

describe("previewHousingImport", () => {
  it("never writes to the database", async () => {
    await previewHousingImport({ rows: [row()], columnMapping: COLUMN_MAPPING, organizationId: ORG });
    expect(eventCreate).not.toHaveBeenCalled();
    expect(leadCreate).not.toHaveBeenCalled();
  });

  it("scopes the duplicate lookup to the caller's organizationId, never the file", async () => {
    await previewHousingImport({ rows: [row()], columnMapping: COLUMN_MAPPING, organizationId: ORG });
    expect(eventFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId_provider_externalEventId: expect.objectContaining({ organizationId: ORG, provider: "HOUSING" }) }) })
    );
  });

  it("flags the same row appearing twice within one file as DUPLICATE (not INVALID, not silently re-counted as VALID)", async () => {
    const result = await previewHousingImport({ rows: [row(), row()], columnMapping: COLUMN_MAPPING, organizationId: ORG });
    expect(result.rows[0].state).toBe("VALID");
    expect(result.rows[1].state).toBe("DUPLICATE");
    expect(result.summary.duplicate).toBe(1);
  });

  it("flags a row as DUPLICATE when an identical Housing event was already imported previously", async () => {
    eventFindUnique.mockResolvedValueOnce({ id: "existing-event" });
    const result = await previewHousingImport({ rows: [row()], columnMapping: COLUMN_MAPPING, organizationId: ORG });
    expect(result.rows[0].state).toBe("DUPLICATE");
  });

  it("flags invalid rows with reasons, without exposing raw internal errors", async () => {
    const result = await previewHousingImport({ rows: [row({ "Lead Phone Number": "" })], columnMapping: COLUMN_MAPPING, organizationId: ORG });
    expect(result.rows[0].state).toBe("INVALID");
    expect(result.rows[0].issues[0]).toMatch(/Lead Phone Number is required/);
  });

  it("throws when a required column is unmapped", async () => {
    await expect(previewHousingImport({ rows: [row()], columnMapping: {}, organizationId: ORG })).rejects.toThrow(/Missing required column/);
  });
});

describe("runHousingImport", () => {
  it("imports a single valid row as a new Lead with source HOUSING, tagged as an import", async () => {
    const result = await runHousingImport({ rows: [row()], columnMapping: COLUMN_MAPPING, fileName: "housing-export.csv", actorId: "user-1", organizationId: ORG });
    expect(result.summary.imported).toBe(1);
    expect(leadCreate).toHaveBeenCalledTimes(1);
    const createArgs = leadCreate.mock.calls[0][0].data;
    expect(createArgs.source).toBe("HOUSING_COM");
    expect(createArgs.portalProvider).toBe("HOUSING");
    expect(createArgs.organizationId).toBe(ORG);
  });

  it("copies Housing Notes into the lead timeline with a Housing Import provenance marker", async () => {
    await runHousingImport({ rows: [row({ Notes: "Please call after 6pm" })], columnMapping: COLUMN_MAPPING, fileName: "f.csv", actorId: "user-1", organizationId: ORG });
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("[Housing Import]") }));
  });

  it("never triggers assignment communication beyond the existing internal auto-assign pipeline", async () => {
    await runHousingImport({ rows: [row()], columnMapping: COLUMN_MAPPING, fileName: "f.csv", actorId: "user-1", organizationId: ORG });
    expect(autoAssignLead).toHaveBeenCalledTimes(1);
  });

  it("does not create a second lead when the exact same row is imported twice (idempotent re-upload)", async () => {
    // First row succeeds; the second identical row must be caught by the
    // same organizationId+provider+externalEventId lookup ingestPortalLead
    // always performs first - simulate the real DB unique-constraint effect
    // by having the lookup return the just-created event on the 2nd row.
    let created = false;
    eventFindUnique.mockImplementation(async () => (created ? { id: "event-1", leadId: "lead-1" } : null));
    eventCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      created = true;
      return { id: "event-1", ...data };
    });

    const result = await runHousingImport({ rows: [row(), row()], columnMapping: COLUMN_MAPPING, fileName: "f.csv", actorId: "user-1", organizationId: ORG });
    expect(leadCreate).toHaveBeenCalledTimes(1);
    expect(result.summary.imported).toBe(1);
    expect(result.summary.duplicatesSkippedOrMatched).toBe(1);
  });

  it("does not auto-merge two genuinely different enquiries from the same phone number", async () => {
    // Same phone, different property AND different date -> different dedup
    // id both times, so ingestPortalLead's phone-based candidate check runs
    // for the second row. Exactly one existing lead with that phone exists
    // -> MATCHED_EXISTING (linked, not destroyed, not duplicated).
    leadFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "lead-1", clientName: "Ramesh Kumar" }]);

    const rowA = row({ "Property/Project ID": "PROJ-1", "Lead Date": "2026-08-15" });
    const rowB = row({ "Property/Project ID": "PROJ-2", "Lead Date": "2026-08-20" });
    const result = await runHousingImport({ rows: [rowA, rowB], columnMapping: COLUMN_MAPPING, fileName: "f.csv", actorId: "user-1", organizationId: ORG });

    expect(leadCreate).toHaveBeenCalledTimes(1); // only the first row created a new Lead
    expect(result.rows[1].outcome).toBe("MATCHED_EXISTING"); // the second was linked, never silently merged/destroyed
  });

  it("marks unmapped required columns as a hard failure before any row is processed", async () => {
    await expect(runHousingImport({ rows: [row()], columnMapping: {}, fileName: "f.csv", actorId: "user-1", organizationId: ORG })).rejects.toThrow(/Missing required column/);
    expect(importJobCreate).not.toHaveBeenCalled();
  });

  it("never persists Address into ImportRecord history", async () => {
    await runHousingImport({ rows: [row({ Address: "Flat 4B, Secret Society, Near Landmark" })], columnMapping: COLUMN_MAPPING, fileName: "f.csv", actorId: "user-1", organizationId: ORG });
    const recordsArg = importRecordCreateMany.mock.calls[0][0].data as Array<{ rawData: string }>;
    expect(recordsArg[0].rawData).not.toContain("Secret Society");
  });

  it("neutralizes a CSV-formula-injection cell before it reaches import history", async () => {
    await runHousingImport({ rows: [row({ Notes: "=SUM(A1:A9)" })], columnMapping: COLUMN_MAPPING, fileName: "f.csv", actorId: "user-1", organizationId: ORG });
    const recordsArg = importRecordCreateMany.mock.calls[0][0].data as Array<{ rawData: string }>;
    expect(recordsArg[0].rawData).toContain("'=SUM(A1:A9)");
  });
});
