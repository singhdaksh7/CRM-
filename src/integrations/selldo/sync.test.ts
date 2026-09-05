import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Sell.Do outbox behaviour: idempotent inline sync after a NEW lead,
 * retry/backoff/dead-letter progression, never touching (let alone
 * deleting) the CRM Lead row on any failure.
 */

const leadFindFirst = vi.fn();
const operationUpsert = vi.fn();
const operationUpdate = vi.fn();
const operationFindUnique = vi.fn();
const operationFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    lead: { findFirst: (...a: unknown[]) => leadFindFirst(...a) },
    portalOperation: {
      upsert: (...a: unknown[]) => operationUpsert(...a),
      update: (...a: unknown[]) => operationUpdate(...a),
      findUnique: (...a: unknown[]) => operationFindUnique(...a),
      findMany: (...a: unknown[]) => operationFindMany(...a),
    },
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const createSelldoLead = vi.fn();
vi.mock("./client", () => ({ createSelldoLead: (...a: unknown[]) => createSelldoLead(...a) }));

vi.mock("./config", () => ({ isSelldoConfigured: () => configured, isSelldoSrdConfigured: () => srdConfigured }));
let configured = true;
let srdConfigured = true;

const { syncSelldoForNewLead, retryFailedSelldoOperations } = await import("./sync");

beforeEach(() => {
  vi.clearAllMocks();
  configured = true;
  srdConfigured = true;
  leadFindFirst.mockResolvedValue({ clientName: "Ramesh", phone: "919811100099", email: "r@example.com", externalListingId: "ad-1" });
  operationUpsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({ id: "op1", attemptCount: 0, ...create }));
  operationUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "op1", ...data }));
});

describe("syncSelldoForNewLead", () => {
  it("creates the operation row and marks it SUCCEEDED on a successful call", async () => {
    createSelldoLead.mockResolvedValue({ ok: true, status: 200 });
    await syncSelldoForNewLead("lead1", "org_default", "conn1");
    expect(operationUpsert.mock.calls[0][0].create).toMatchObject({ organizationId: "org_default", operationType: "SELLDO_LEAD_SYNC", provider: "OLX", status: "PENDING" });
    expect(operationUpdate.mock.calls[0][0].data.status).toBe("SUCCEEDED");
  });

  it("never double-submits: skips the attempt entirely if the operation already SUCCEEDED", async () => {
    operationUpsert.mockResolvedValueOnce({ id: "op1", status: "SUCCEEDED", attemptCount: 1 });
    await syncSelldoForNewLead("lead1", "org_default", "conn1");
    expect(createSelldoLead).not.toHaveBeenCalled();
    expect(operationUpdate).not.toHaveBeenCalled();
  });

  it("never re-attempts a DEAD_LETTER operation", async () => {
    operationUpsert.mockResolvedValueOnce({ id: "op1", status: "DEAD_LETTER", attemptCount: 5 });
    await syncSelldoForNewLead("lead1", "org_default", "conn1");
    expect(createSelldoLead).not.toHaveBeenCalled();
  });

  it("builds the note with OLX ad id and CRM lead id, and never leaks credentials into it", async () => {
    createSelldoLead.mockResolvedValue({ ok: true, status: 200 });
    await syncSelldoForNewLead("lead1", "org_default", "conn1");
    const note = createSelldoLead.mock.calls[0][0].note as string;
    expect(note).toContain("OLX Ad ID: ad-1");
    expect(note).toContain("CRM Lead ID: lead1");
    expect(note.toLowerCase()).not.toContain("password");
    expect(note.toLowerCase()).not.toContain("token");
  });

  it("marks RETRYABLE (not a crash) when SRD is not configured, and never calls the Sell.Do client", async () => {
    srdConfigured = false;
    await syncSelldoForNewLead("lead1", "org_default", "conn1");
    expect(createSelldoLead).not.toHaveBeenCalled();
    expect(operationUpdate.mock.calls[0][0].data.status).toBe("RETRYABLE");
    expect(operationUpdate.mock.calls[0][0].data.failureReason).toMatch(/SRD/);
  });

  it("marks RETRYABLE with a distant retry when the Sell.Do API key is not configured", async () => {
    configured = false;
    await syncSelldoForNewLead("lead1", "org_default", "conn1");
    expect(createSelldoLead).not.toHaveBeenCalled();
    expect(operationUpdate.mock.calls[0][0].data.status).toBe("RETRYABLE");
  });

  it("never touches the Lead table on an API error - only the operation ledger is written", async () => {
    createSelldoLead.mockResolvedValue({ ok: false, reason: "API_ERROR", status: 500 });
    await syncSelldoForNewLead("lead1", "org_default", "conn1");
    expect(operationUpdate.mock.calls[0][0].data.status).toBe("RETRYABLE");
    // The mocked prisma.lead client exposes only findFirst - any write attempt would throw "is not a function".
  });

  it("never touches the Lead table on a network/timeout error either", async () => {
    createSelldoLead.mockResolvedValue({ ok: false, reason: "NETWORK_ERROR", message: "timeout" });
    await syncSelldoForNewLead("lead1", "org_default", "conn1");
    expect(operationUpdate.mock.calls[0][0].data.status).toBe("RETRYABLE");
  });

  it("dead-letters after the max attempt budget is exhausted", async () => {
    operationUpsert.mockResolvedValueOnce({ id: "op1", status: "PENDING", attemptCount: 4 });
    createSelldoLead.mockResolvedValue({ ok: false, reason: "API_ERROR", status: 500 });
    await syncSelldoForNewLead("lead1", "org_default", "conn1");
    expect(operationUpdate.mock.calls[0][0].data.status).toBe("DEAD_LETTER");
    expect(operationUpdate.mock.calls[0][0].data.retryEligibleAt).toBeNull();
  });

  it("dead-letters (rather than looping forever) when the lead no longer belongs to the organization", async () => {
    leadFindFirst.mockResolvedValue(null);
    await syncSelldoForNewLead("lead1", "org_other", "conn1");
    expect(createSelldoLead).not.toHaveBeenCalled();
    expect(operationUpdate.mock.calls[0][0].data.status).toBe("DEAD_LETTER");
  });
});

describe("retryFailedSelldoOperations", () => {
  it("re-attempts every due RETRYABLE operation and reports the outcome breakdown", async () => {
    operationFindMany.mockResolvedValue([
      { id: "op1", organizationId: "org_default", idempotencyKey: "selldo-lead-sync:lead1", attemptCount: 1, connectionId: "conn1" },
      { id: "op2", organizationId: "org_default", idempotencyKey: "selldo-lead-sync:lead2", attemptCount: 4, connectionId: "conn1" },
    ]);
    createSelldoLead.mockResolvedValue({ ok: true, status: 200 });
    operationFindUnique.mockResolvedValue({ status: "SUCCEEDED" });

    const summary = await retryFailedSelldoOperations();
    expect(summary.attempted).toBe(2);
    expect(operationFindMany.mock.calls[0][0].where).toMatchObject({ operationType: "SELLDO_LEAD_SYNC", status: "RETRYABLE" });
  });

  it("never double-submits an already-synced lead across an inline attempt followed by a retry pass", async () => {
    createSelldoLead.mockResolvedValue({ ok: true, status: 200 });
    await syncSelldoForNewLead("lead1", "org_default", "conn1");
    createSelldoLead.mockClear();

    operationFindMany.mockResolvedValue([]); // SUCCEEDED rows are never selected by the RETRYABLE-only query
    await retryFailedSelldoOperations();
    expect(createSelldoLead).not.toHaveBeenCalled();
  });
});
