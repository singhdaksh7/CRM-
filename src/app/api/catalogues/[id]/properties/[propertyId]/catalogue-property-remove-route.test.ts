import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const catalogueShareFindUnique = vi.fn();
const transaction = vi.fn();
const activityCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    catalogueShare: { findUnique: (...a: unknown[]) => catalogueShareFindUnique(...a), update: vi.fn() },
    catalogueShareProperty: { update: vi.fn() },
    catalogueVersionEvent: { create: vi.fn() },
    activity: { create: (...a: unknown[]) => activityCreate(...a) },
    $transaction: (...a: unknown[]) => transaction(...a),
  },
}));

let sessionUser: { id: string; role: string } = { id: "admin1", role: "ADMIN" };

const { MockApiError } = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { MockApiError };
});

vi.mock("@/lib/api-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    ApiError: MockApiError,
    requireSession: async (allowedRoles?: string[]) => {
      if (allowedRoles && !allowedRoles.includes(sessionUser.role)) throw new MockApiError(403, "Forbidden");
      return { user: sessionUser };
    },
    handleApiError: (err: unknown) => {
      if (err instanceof MockApiError) return NextResponse.json({ error: err.message }, { status: err.status });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    },
  };
});

function CATALOGUE(overrides = {}) {
  return {
    id: "cat1",
    organizationId: "org_default",
    leadId: "lead1",
    title: "Shortlist for Rahul",
    version: 1,
    properties: [{ id: "csp1", propertyId: "p1", removedAt: null }],
    ...overrides,
  };
}

function req(body: unknown = {}) {
  return new NextRequest(new Request("https://x.test/api/catalogues/cat1/properties/p1", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}

function params() {
  return { params: Promise.resolve({ id: "cat1", propertyId: "p1" }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = { id: "admin1", role: "ADMIN" };
  catalogueShareFindUnique.mockResolvedValue(CATALOGUE());
  transaction.mockResolvedValue([]);
});

describe("DELETE /api/catalogues/[id]/properties/[propertyId]", () => {
  it("soft-removes the property and bumps the catalogue version", async () => {
    const { DELETE } = await import("./route");
    const res = await DELETE(req({ reason: "No longer available" }), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe(2);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(activityCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "CATALOGUE_VERSION_CHANGED" }) }));
  });

  it("rejects FIELD_EXECUTIVE with 403", async () => {
    sessionUser = { id: "fe1", role: "FIELD_EXECUTIVE" };
    const { DELETE } = await import("./route");
    const res = await DELETE(req(), params());
    expect(res.status).toBe(403);
  });

  it("404s when the property isn't part of this catalogue", async () => {
    const { DELETE } = await import("./route");
    const res = await DELETE(req(), { params: Promise.resolve({ id: "cat1", propertyId: "not-in-catalogue" }) });
    expect(res.status).toBe(404);
  });

  it("409s when the property was already removed", async () => {
    catalogueShareFindUnique.mockResolvedValue(CATALOGUE({ properties: [{ id: "csp1", propertyId: "p1", removedAt: new Date() }] }));
    const { DELETE } = await import("./route");
    const res = await DELETE(req(), params());
    expect(res.status).toBe(409);
  });
});
