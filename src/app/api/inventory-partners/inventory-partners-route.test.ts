import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const inventoryPartnerFindMany = vi.fn();
const inventoryPartnerCount = vi.fn();
const inventoryPartnerCreate = vi.fn();
const propertyGroupBy = vi.fn();
const activityCreate = vi.fn();
const auditLogCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    inventoryPartner: {
      findMany: (...a: unknown[]) => inventoryPartnerFindMany(...a),
      count: (...a: unknown[]) => inventoryPartnerCount(...a),
      create: (...a: unknown[]) => inventoryPartnerCreate(...a),
    },
    property: {
      groupBy: (...a: unknown[]) => propertyGroupBy(...a),
    },
    activity: {
      create: (...a: unknown[]) => activityCreate(...a),
    },
    auditLog: {
      create: (...a: unknown[]) => auditLogCreate(...a),
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

const { GET, POST } = await import("./route");

function getRequest(qs = "") {
  return new NextRequest(new Request(`https://x.test/api/inventory-partners${qs}`));
}

function postRequest(body: unknown) {
  return new NextRequest(
    new Request("https://x.test/api/inventory-partners", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  );
}

const VALID_BODY = {
  name: "Sharma Real Estate Dealers",
  phone: "9876543210",
  localities: ["Janakpuri"],
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = { id: "admin1", role: "ADMIN" };
  inventoryPartnerFindMany.mockResolvedValue([]);
  inventoryPartnerCount.mockResolvedValue(0);
  propertyGroupBy.mockResolvedValue([]);
});

describe("GET /api/inventory-partners", () => {
  it("returns partners with derived active property counts", async () => {
    inventoryPartnerFindMany.mockResolvedValue([{ id: "p1", name: "Sharma Dealers" }]);
    inventoryPartnerCount.mockResolvedValue(1);
    propertyGroupBy.mockResolvedValue([{ partnerId: "p1", _count: 3 }]);

    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inventoryPartners[0].activePropertyCount).toBe(3);
  });

  it("applies a search filter across name/phone/company/partnerCode", async () => {
    await GET(getRequest("?q=Sharma"));
    const call = inventoryPartnerFindMany.mock.calls[0][0];
    expect(call.where.OR).toEqual(
      expect.arrayContaining([{ name: { contains: "Sharma" } }])
    );
  });
});

describe("POST /api/inventory-partners", () => {
  it("creates an inventory partner as ADMIN", async () => {
    inventoryPartnerCount.mockResolvedValue(0);
    inventoryPartnerCreate.mockResolvedValue({ id: "p1", name: "Sharma Real Estate Dealers", partnerCode: "PTR-00001" });

    const res = await POST(postRequest(VALID_BODY));
    expect(res.status).toBe(201);
    expect(inventoryPartnerCreate).toHaveBeenCalled();
    expect(activityCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "INVENTORY_PARTNER_CREATED" }) }));
  });

  it("rejects FIELD_EXECUTIVE with 403", async () => {
    sessionUser = { id: "fe1", role: "FIELD_EXECUTIVE" };
    const res = await POST(postRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it("rejects a missing phone with 400", async () => {
    const res = await POST(postRequest({ name: "Sharma Dealers" }));
    expect(res.status).toBe(400);
  });
});
