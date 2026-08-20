import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const catalogueShareFindUnique = vi.fn();
const leadFindFirst = vi.fn();
const catalogueSharePropertyUpdate = vi.fn();
const activityCreate = vi.fn();
const auditLogCreate = vi.fn();
const propertyTimelineEventCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    catalogueShare: { findUnique: (...a: unknown[]) => catalogueShareFindUnique(...a) },
    lead: { findFirst: (...a: unknown[]) => leadFindFirst(...a) },
    catalogueShareProperty: { update: (...a: unknown[]) => catalogueSharePropertyUpdate(...a) },
    activity: { create: (...a: unknown[]) => activityCreate(...a) },
    auditLog: { create: (...a: unknown[]) => auditLogCreate(...a) },
    propertyTimelineEvent: { create: (...a: unknown[]) => propertyTimelineEventCreate(...a) },
  },
}));

let sessionUser: { id: string; role: string } = { id: "fe1", role: "FIELD_EXECUTIVE" };

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
      if (err && typeof err === "object" && "issues" in err) return NextResponse.json({ error: "Validation failed", issues: (err as { issues: unknown }).issues }, { status: 400 });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    },
  };
});

vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => auditLogCreate(...a) }));

const CATALOGUE = {
  id: "cat1",
  organizationId: "org_default",
  leadId: "lead1",
  title: "Shortlist for Rahul",
  properties: [{ id: "csp1", propertyId: "p1", executiveStatus: "PENDING" }],
};

function patchReq(body: unknown) {
  return new NextRequest(
    new Request("https://x.test/api/catalogues/cat1/properties/p1/status", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  );
}

function params() {
  return { params: Promise.resolve({ id: "cat1", propertyId: "p1" }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = { id: "fe1", role: "FIELD_EXECUTIVE" };
  catalogueShareFindUnique.mockResolvedValue(CATALOGUE);
  leadFindFirst.mockResolvedValue({ id: "lead1", assignedToId: "fe1" });
});

describe("PATCH /api/catalogues/[id]/properties/[propertyId]/status", () => {
  it("updates the executive status and logs activity/audit/timeline", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(patchReq({ executiveStatus: "CUSTOMER_LIKED" }), params());
    expect(res.status).toBe(200);
    expect(catalogueSharePropertyUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "csp1" }, data: expect.objectContaining({ executiveStatus: "CUSTOMER_LIKED" }) }));
    expect(activityCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "CATALOGUE_PROPERTY_STATUS_UPDATED" }) }));
    expect(propertyTimelineEventCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: "CATALOGUE_PROPERTY_STATUS_UPDATED", toValue: "CUSTOMER_LIKED" }) }));
  });

  it("denies a FIELD_EXECUTIVE for a lead not assigned to them", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead1", assignedToId: "someone-else" });
    const { PATCH } = await import("./route");
    const res = await PATCH(patchReq({ executiveStatus: "SHOWN" }), params());
    expect(res.status).toBe(403);
  });

  it("404s when the property isn't part of this catalogue", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(patchReq({ executiveStatus: "SHOWN" }), { params: Promise.resolve({ id: "cat1", propertyId: "not-in-catalogue" }) });
    expect(res.status).toBe(404);
  });

  it("rejects an invalid executiveStatus with 400", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(patchReq({ executiveStatus: "NOT_A_REAL_STATUS" }), params());
    expect(res.status).toBe(400);
  });
});
