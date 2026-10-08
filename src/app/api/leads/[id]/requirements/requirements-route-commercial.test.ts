import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Commercial lead requirements reuse the existing LeadRequirement model
 * (assetClass + propertyType + budget + area + transaction + localities) -
 * no parallel schema. These pin the validation that keeps a brief matchable:
 * the category and type must agree, a commercial brief carries no BHK, and
 * an unknown type is a 400 (not a Prisma 500), all org-scoped.
 */

const leadFindFirst = vi.fn();
const localityCount = vi.fn();
const requirementCreate = vi.fn();
const logActivity = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    lead: { findFirst: (...a: unknown[]) => leadFindFirst(...a) },
    propertyLocality: { count: (...a: unknown[]) => localityCount(...a) },
    leadRequirement: { create: (...a: unknown[]) => requirementCreate(...a) },
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
    handleApiError: (err: { status?: number; message: string; issues?: unknown }) =>
      err.issues ? NextResponse.json({ error: "Validation failed", issues: err.issues }, { status: 400 }) : NextResponse.json({ error: err.message }, { status: err.status ?? 500 }),
  };
});

vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));
vi.mock("@/lib/activity", () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));

const { POST } = await import("./route");

function req(body: Record<string, unknown>) {
  return new NextRequest(new Request("https://x.test/api/leads/lead1/requirements", { method: "POST", body: JSON.stringify(body) }));
}
const params = { params: Promise.resolve({ id: "lead1" }) };

const commercialShopBrief = { assetClass: "COMMERCIAL", transactionType: "RENT", propertyType: "SHOP", minBudget: 50000, maxBudget: 100000, minAreaSqft: 300, maxAreaSqft: 600, localityIds: ["loc-rg"] };

beforeEach(() => {
  vi.clearAllMocks();
  leadFindFirst.mockResolvedValue({ id: "lead1", organizationId: "org_default", assignedToId: "admin1" });
  localityCount.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.length);
  requirementCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "req1", ...data }));
});

describe("POST /api/leads/[id]/requirements - commercial", () => {
  it("creates a commercial shop requirement (type, locality, budget, area, transaction)", async () => {
    const res = await POST(req(commercialShopBrief), params);
    expect(res.status).toBe(201);
    const data = requirementCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({ assetClass: "COMMERCIAL", propertyType: "SHOP", transactionType: "RENT", maxBudget: 100000, minAreaSqft: 300, organizationId: "org_default" });
    expect(data.bhkValues.create).toEqual([]);
  });

  it("rejects a residential type on a commercial requirement", async () => {
    const res = await POST(req({ ...commercialShopBrief, propertyType: "APARTMENT" }), params);
    expect(res.status).toBe(400);
    expect(requirementCreate).not.toHaveBeenCalled();
  });

  it("rejects a commercial type on a residential requirement", async () => {
    const res = await POST(req({ ...commercialShopBrief, assetClass: "RESIDENTIAL", propertyType: "WAREHOUSE" }), params);
    expect(res.status).toBe(400);
    expect(requirementCreate).not.toHaveBeenCalled();
  });

  it("rejects BHK on a commercial requirement", async () => {
    const res = await POST(req({ ...commercialShopBrief, bhks: [2] }), params);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(JSON.stringify(json.issues)).toMatch(/BHK does not apply/);
  });

  it("rejects an unknown property type with a 400, never a Prisma 500 (old label-as-value bug)", async () => {
    const res = await POST(req({ ...commercialShopBrief, propertyType: "COMMERCIAL SHOP" }), params);
    expect(res.status).toBe(400);
    expect(requirementCreate).not.toHaveBeenCalled();
  });

  it("still accepts an ordinary residential requirement with BHKs", async () => {
    const res = await POST(req({ assetClass: "RESIDENTIAL", transactionType: "SALE", propertyType: "APARTMENT", bhks: [2, 3], localityIds: [] }), params);
    expect(res.status).toBe(201);
  });

  it("refuses localities that do not belong to the caller's organization (tenant isolation)", async () => {
    localityCount.mockResolvedValue(0);
    const res = await POST(req(commercialShopBrief), params);
    expect(res.status).toBe(400);
    expect(localityCount.mock.calls[0][0].where.organizationId).toBe("org_default");
  });
});
