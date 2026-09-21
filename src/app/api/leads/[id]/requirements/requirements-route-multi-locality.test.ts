import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Lead Requirements V2 already models multiple localities per requirement
 * via the LeadRequirementLocality join table (see schema.prisma). These
 * tests confirm the create/edit API routes wire ALL submitted localityIds
 * through (not just the first one), and that an edit fully replaces the set
 * (deleteMany + create) so a subsequent reload reflects exactly what was
 * submitted - not a union of old and new.
 */

const leadFindFirst = vi.fn();
const localityCount = vi.fn();
const requirementCreate = vi.fn();
const requirementUpdate = vi.fn();
const requirementFindFirst = vi.fn();
const logActivity = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    lead: { findFirst: (...a: unknown[]) => leadFindFirst(...a) },
    propertyLocality: { count: (...a: unknown[]) => localityCount(...a) },
    leadRequirement: {
      create: (...a: unknown[]) => requirementCreate(...a),
      update: (...a: unknown[]) => requirementUpdate(...a),
      findFirst: (...a: unknown[]) => requirementFindFirst(...a),
    },
  },
}));

vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    ApiError: class ApiError extends Error {
      status: number;
      constructor(status: number, message: string) {
        super(message);
        this.status = status;
      }
    },
    requireSession: async () => ({ user: { id: "admin1", role: "ADMIN", organizationId: "org_default" } }),
    handleApiError: (err: { status?: number; message: string }) => NextResponse.json({ error: err.message }, { status: err.status ?? 500 }),
  };
});

vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));
vi.mock("@/lib/activity", () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));

const { POST } = await import("./route");
const { PATCH } = await import("./[requirementId]/route");

function req(body: Record<string, unknown>) {
  return new NextRequest(new Request("https://x.test/api/leads/lead1/requirements", { method: "POST", body: JSON.stringify(body) }));
}

function params() {
  return { params: Promise.resolve({ id: "lead1" }) };
}

function patchParams() {
  return { params: Promise.resolve({ id: "lead1", requirementId: "req1" }) };
}

const baseBody = { transactionType: "SALE", assetClass: "RESIDENTIAL", localityIds: ["loc-a", "loc-b", "loc-c"] };

beforeEach(() => {
  vi.clearAllMocks();
  leadFindFirst.mockResolvedValue({ id: "lead1", organizationId: "org_default", assignedToId: "admin1" });
  // Mirrors the real assertLocalitiesOwned/ownership-count check: the org
  // "owns" every id the caller passed in, sized to the DEDUPED set (the
  // route always de-dupes with `[...new Set(...)]` before counting).
  localityCount.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.length);
  requirementCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "req1", ...data }));
  requirementUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "req1", ...data }));
  requirementFindFirst.mockResolvedValue({ id: "req1", leadId: "lead1", organizationId: "org_default" });
});

describe("POST /api/leads/[id]/requirements - multiple localities", () => {
  it("creates the requirement with ALL submitted localities, not just the first", async () => {
    const res = await POST(req(baseBody), params());
    expect(res.status).toBe(201);
    const createArgs = requirementCreate.mock.calls[0][0].data;
    expect(createArgs.localities.create).toEqual([{ localityId: "loc-a" }, { localityId: "loc-b" }, { localityId: "loc-c" }]);
  });

  it("dedupes repeated locality ids before persisting", async () => {
    await POST(req({ ...baseBody, localityIds: ["loc-a", "loc-a", "loc-b"] }), params());
    const createArgs = requirementCreate.mock.calls[0][0].data;
    expect(createArgs.localities.create).toEqual([{ localityId: "loc-a" }, { localityId: "loc-b" }]);
  });
});

describe("PATCH /api/leads/[id]/requirements/[requirementId] - multiple localities", () => {
  it("replaces the full locality set (delete + recreate) so a reload reflects exactly what was submitted", async () => {
    const res = await PATCH(req({ ...baseBody, localityIds: ["loc-a", "loc-b"] }), patchParams());
    expect(res.status).toBe(200);
    const updateArgs = requirementUpdate.mock.calls[0][0].data;
    expect(updateArgs.localities.deleteMany).toEqual({});
    expect(updateArgs.localities.create).toEqual([{ localityId: "loc-a" }, { localityId: "loc-b" }]);
  });

  it("preserves 3 localities across an edit that only changes an unrelated field", async () => {
    const res = await PATCH(req({ ...baseBody, notes: "updated notes" }), patchParams());
    expect(res.status).toBe(200);
    const updateArgs = requirementUpdate.mock.calls[0][0].data;
    expect(updateArgs.localities.create).toHaveLength(3);
  });
});
