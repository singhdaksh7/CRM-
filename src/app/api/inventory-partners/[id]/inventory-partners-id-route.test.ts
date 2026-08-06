import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const inventoryPartnerFindFirst = vi.fn();
const inventoryPartnerUpdate = vi.fn();
const propertyCount = vi.fn();
const activityCreate = vi.fn();
const auditLogCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inventoryPartner: {
      findFirst: (...a: unknown[]) => inventoryPartnerFindFirst(...a),
      update: (...a: unknown[]) => inventoryPartnerUpdate(...a),
    },
    property: {
      count: (...a: unknown[]) => propertyCount(...a),
    },
    activity: {
      create: (...a: unknown[]) => activityCreate(...a),
    },
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
      if (err && typeof err === "object" && "issues" in err) return NextResponse.json({ error: "Validation failed", issues: (err as { issues: unknown }).issues }, { status: 400 });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    },
  };
});

vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => auditLogCreate(...a) }));

const { GET, PATCH } = await import("./route");

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(body: unknown) {
  return new NextRequest(
    new Request("https://x.test/api/inventory-partners/p1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = { id: "admin1", role: "ADMIN" };
});

describe("GET /api/inventory-partners/[id]", () => {
  it("returns 404 when not found", async () => {
    inventoryPartnerFindFirst.mockResolvedValue(null);
    const res = await GET(new NextRequest(new Request("https://x.test/api/inventory-partners/p1")), params("p1"));
    expect(res.status).toBe(404);
  });

  it("returns the partner with a derived active property count", async () => {
    inventoryPartnerFindFirst.mockResolvedValue({ id: "p1", name: "Sharma Dealers", properties: [] });
    propertyCount.mockResolvedValue(5);
    const res = await GET(new NextRequest(new Request("https://x.test/api/inventory-partners/p1")), params("p1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inventoryPartner.activePropertyCount).toBe(5);
  });
});

describe("PATCH /api/inventory-partners/[id]", () => {
  it("allows DATA_MANAGER to update", async () => {
    sessionUser = { id: "dm1", role: "DATA_MANAGER" };
    inventoryPartnerFindFirst.mockResolvedValue({ id: "p1", name: "Old Name" });
    inventoryPartnerUpdate.mockResolvedValue({ id: "p1", name: "New Name" });
    const res = await PATCH(patchRequest({ name: "New Name" }), params("p1"));
    expect(res.status).toBe(200);
  });

  it("rejects FIELD_EXECUTIVE with 403", async () => {
    sessionUser = { id: "fe1", role: "FIELD_EXECUTIVE" };
    const res = await PATCH(patchRequest({ name: "New Name" }), params("p1"));
    expect(res.status).toBe(403);
  });

  it("returns 404 for a partner in a different organization", async () => {
    inventoryPartnerFindFirst.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ name: "New Name" }), params("p1"));
    expect(res.status).toBe(404);
  });

  it("logs an INVENTORY_PARTNER_UPDATED activity on success", async () => {
    inventoryPartnerFindFirst.mockResolvedValue({ id: "p1", name: "Old Name" });
    inventoryPartnerUpdate.mockResolvedValue({ id: "p1", name: "New Name" });
    await PATCH(patchRequest({ name: "New Name" }), params("p1"));
    expect(activityCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "INVENTORY_PARTNER_UPDATED" }) }));
  });
});
