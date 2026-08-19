import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Retry / dead-letter / conflict-resolution behaviour of the portal operation
 * ledger. All of it is local bookkeeping - a retry re-queues an operation for
 * an authorized adapter, it never itself calls a provider.
 */

const operationFindFirstOrThrow = vi.fn();
const operationUpdate = vi.fn();
const operationUpsert = vi.fn();
const listingUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    portalOperation: {
      findFirstOrThrow: (...a: unknown[]) => operationFindFirstOrThrow(...a),
      update: (...a: unknown[]) => operationUpdate(...a),
      upsert: (...a: unknown[]) => operationUpsert(...a),
    },
    portalListing: { update: (...a: unknown[]) => listingUpdate(...a) },
  },
}));

vi.mock("server-only", () => ({}));

const { retryPortalOperation, recordFailedOperation, detectListingConflict, resolveListingConflict } = await import("./operations");

beforeEach(() => {
  vi.clearAllMocks();
  operationUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "op1", ...data }));
  operationUpsert.mockImplementation(async (args: { create: Record<string, unknown> }) => ({ id: "op1", ...args.create }));
  listingUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "listing1", ...data }));
});

describe("retryPortalOperation", () => {
  it("re-queues a retryable operation and backs the next attempt off", async () => {
    operationFindFirstOrThrow.mockResolvedValue({ id: "op1", status: "RETRYABLE", attemptCount: 1 });
    const result = await retryPortalOperation("org_default", "op1");
    expect(result.status).toBe("RETRYABLE");
    expect(result.attemptCount).toBe(2);
    expect(result.retryEligibleAt).toBeInstanceOf(Date);
  });

  it("moves an operation to DEAD_LETTER once the attempt budget is exhausted", async () => {
    operationFindFirstOrThrow.mockResolvedValue({ id: "op1", status: "RETRYABLE", attemptCount: 2 });
    const result = await retryPortalOperation("org_default", "op1");
    expect(result.status).toBe("DEAD_LETTER");
    expect(result.attemptCount).toBe(3);
    expect(result.retryEligibleAt).toBeNull();
  });

  it("refuses to retry an operation already in DEAD_LETTER", async () => {
    operationFindFirstOrThrow.mockResolvedValue({ id: "op1", status: "DEAD_LETTER", attemptCount: 3 });
    await expect(retryPortalOperation("org_default", "op1")).rejects.toThrow("not retryable");
    expect(operationUpdate).not.toHaveBeenCalled();
  });

  it("refuses to retry an operation that already succeeded", async () => {
    operationFindFirstOrThrow.mockResolvedValue({ id: "op1", status: "SUCCEEDED", attemptCount: 1 });
    await expect(retryPortalOperation("org_default", "op1")).rejects.toThrow("not retryable");
    expect(operationUpdate).not.toHaveBeenCalled();
  });

  it("looks the operation up scoped to the caller's organization", async () => {
    operationFindFirstOrThrow.mockResolvedValue({ id: "op1", status: "PENDING", attemptCount: 0 });
    await retryPortalOperation("org_other", "op1");
    expect(operationFindFirstOrThrow.mock.calls[0][0].where).toEqual({ id: "op1", organizationId: "org_other" });
  });

  it("never marks an operation SUCCEEDED - only an authorized adapter can do that", async () => {
    operationFindFirstOrThrow.mockResolvedValue({ id: "op1", status: "RETRYABLE", attemptCount: 1 });
    expect((await retryPortalOperation("org_default", "op1")).status).not.toBe("SUCCEEDED");
  });
});

describe("recordFailedOperation", () => {
  it("keys the ledger entry idempotently on provider, operation and request", async () => {
    const input = { organizationId: "org_default", provider: "HOUSING" as const, operationType: "PUBLISH_LISTING", request: { propertyId: "p1" }, failureReason: "blocked" };
    const first = await recordFailedOperation(input);
    const second = await recordFailedOperation(input);
    expect(operationUpsert.mock.calls[0][0].where.organizationId_idempotencyKey.idempotencyKey)
      .toBe(operationUpsert.mock.calls[1][0].where.organizationId_idempotencyKey.idempotencyKey);
    expect(first.idempotencyKey).toBe(second.idempotencyKey);
  });

  it("gives a different request a different idempotency key", async () => {
    await recordFailedOperation({ organizationId: "org_default", provider: "HOUSING", operationType: "PUBLISH_LISTING", request: { propertyId: "p1" }, failureReason: "x" });
    await recordFailedOperation({ organizationId: "org_default", provider: "HOUSING", operationType: "PUBLISH_LISTING", request: { propertyId: "p2" }, failureReason: "x" });
    expect(operationUpsert.mock.calls[0][0].where.organizationId_idempotencyKey.idempotencyKey)
      .not.toBe(operationUpsert.mock.calls[1][0].where.organizationId_idempotencyKey.idempotencyKey);
  });

  it("scopes the upsert to the organization so two tenants never share a ledger row", async () => {
    await recordFailedOperation({ organizationId: "org_a", provider: "OLX", operationType: "PULL_LEADS", request: {}, failureReason: "x" });
    expect(operationUpsert.mock.calls[0][0].where.organizationId_idempotencyKey.organizationId).toBe("org_a");
  });

  it("increments the attempt count on a repeat failure rather than resetting it", async () => {
    await recordFailedOperation({ organizationId: "org_default", provider: "OLX", operationType: "PULL_LEADS", request: {}, failureReason: "again" });
    expect(operationUpsert.mock.calls[0][0].update.attemptCount).toEqual({ increment: 1 });
  });
});

describe("listing conflicts", () => {
  it("does nothing when nothing supported actually differs", async () => {
    const result = await detectListingConflict("org_default", "listing1", { price: 100 }, { price: 100 });
    expect(result).toBeNull();
    expect(listingUpdate).not.toHaveBeenCalled();
  });

  it("parks the listing in SYNC_CONFLICT with the differing fields recorded", async () => {
    await detectListingConflict("org_default", "listing1", { price: 100 }, { price: 90 });
    const { data, where } = listingUpdate.mock.calls[0][0];
    expect(where).toEqual({ id: "listing1", organizationId: "org_default" });
    expect(data.status).toBe("SYNC_CONFLICT");
    expect(JSON.parse(data.conflictFields)).toEqual(["price"]);
  });

  it("clears any previous resolution when a fresh conflict is detected", async () => {
    await detectListingConflict("org_default", "listing1", { price: 100 }, { price: 90 });
    const { data } = listingUpdate.mock.calls[0][0];
    expect(data.conflictResolution).toBeNull();
    expect(data.conflictResolvedAt).toBeNull();
    expect(data.conflictResolvedById).toBeNull();
  });

  it("records who resolved a conflict and how", async () => {
    await resolveListingConflict("org_default", "listing1", "KEEP_CRM", "admin1");
    const { data } = listingUpdate.mock.calls[0][0];
    expect(data.conflictResolution).toBe("KEEP_CRM");
    expect(data.conflictResolvedById).toBe("admin1");
    expect(data.status).toBe("PUBLISHED");
  });

  it("leaves a listing in SYNC_CONFLICT when the human defers with REVIEW", async () => {
    await resolveListingConflict("org_default", "listing1", "REVIEW", "admin1");
    const { data } = listingUpdate.mock.calls[0][0];
    expect(data.conflictResolution).toBe("REVIEW");
    expect(data.status).toBeUndefined();
  });

  it("never silently applies the portal's values on ACCEPT_PORTAL - it only records the decision", async () => {
    await resolveListingConflict("org_default", "listing1", "ACCEPT_PORTAL", "admin1");
    const { data } = listingUpdate.mock.calls[0][0];
    expect(data.conflictResolution).toBe("ACCEPT_PORTAL");
    // No CRM field is overwritten from portalSnapshot here by design.
    expect(Object.keys(data).sort()).toEqual(["conflictResolution", "conflictResolvedAt", "conflictResolvedById", "status"]);
  });

  it("scopes conflict resolution to the caller's organization", async () => {
    await resolveListingConflict("org_other", "listing1", "KEEP_CRM", "admin1");
    expect(listingUpdate.mock.calls[0][0].where).toEqual({ id: "listing1", organizationId: "org_other" });
  });
});
