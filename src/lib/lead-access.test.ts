import { describe, it, expect, vi, beforeEach } from "vitest";

const leadFindFirst = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    lead: {
      findFirst: (...a: unknown[]) => leadFindFirst(...a),
    },
  },
}));

vi.mock("./organization", () => ({
  getOrganizationId: (user: { organizationId: string }) => user.organizationId,
}));

// api-auth.ts transitively imports src/lib/auth.ts (full NextAuth stack),
// which fails to resolve in the vitest environment - the same reason
// api-auth.ts's own handleApiError comment gives for duck-typing ApiError
// instead of importing it elsewhere. Mocked with a real Error subclass here
// (same pattern used by e.g.
// src/app/api/catalogues/[id]/properties/[propertyId]/status/catalogue-property-status-route.test.ts)
// so lead-access.ts's `new ApiError(...)` and this test's `.status`
// assertions both work against the same class.
vi.mock("./api-auth", () => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { ApiError: MockApiError };
});

import { assertLeadAccessible, isLeadAccessibleToUser, fieldExecutiveLeadReadWhere } from "./lead-access";
import type { ApiError } from "./api-auth";
import type { Role } from "@prisma/client";

const ORG = "org_1";

function session(role: "ADMIN" | "DATA_MANAGER" | "FIELD_EXECUTIVE", id = "user_1") {
  return { user: { id, role, organizationId: ORG } };
}

// simplified-role-workflow (targeted fix pass, Blocker B) - the pure
// predicate itself, tested in isolation from any Prisma call, so every
// caller (the lead detail page, GET /api/leads/[id], assertLeadAccessible,
// and any future one) shares exactly this behavior rather than each
// re-deriving its own slightly-different copy.
describe("isLeadAccessibleToUser", () => {
  const fe = { id: "fe_1", role: "FIELD_EXECUTIVE" as Role };

  it("FE assigned to self -> true", () => {
    expect(isLeadAccessibleToUser({ assignedToId: "fe_1" }, fe)).toBe(true);
  });

  it("FE, currently-unassigned lead -> true", () => {
    expect(isLeadAccessibleToUser({ assignedToId: null }, fe)).toBe(true);
  });

  it("FE, another FE's assigned lead -> false", () => {
    expect(isLeadAccessibleToUser({ assignedToId: "other_fe" }, fe)).toBe(false);
  });

  it.each(["ADMIN", "DATA_MANAGER"] as Role[])("%s can access any lead regardless of assignment", (role) => {
    expect(isLeadAccessibleToUser({ assignedToId: "someone_else" }, { id: "mgr_1", role })).toBe(true);
    expect(isLeadAccessibleToUser({ assignedToId: null }, { id: "mgr_1", role })).toBe(true);
  });
});

describe("assertLeadAccessible", () => {
  beforeEach(() => {
    leadFindFirst.mockReset();
  });

  it("404s when the lead does not exist in the caller's organization", async () => {
    leadFindFirst.mockResolvedValue(null);
    await expect(assertLeadAccessible(session("ADMIN"), "lead_x")).rejects.toMatchObject({ status: 404 } as Partial<ApiError>);
    expect(leadFindFirst).toHaveBeenCalledWith({ where: { id: "lead_x", organizationId: ORG } });
  });

  it("ADMIN and DATA_MANAGER can access any lead in their organization regardless of assignment", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead_1", assignedToId: "someone_else" });
    await expect(assertLeadAccessible(session("ADMIN"), "lead_1")).resolves.toMatchObject({ id: "lead_1" });
    await expect(assertLeadAccessible(session("DATA_MANAGER"), "lead_1")).resolves.toMatchObject({ id: "lead_1" });
  });

  it("FIELD_EXECUTIVE can access a lead assigned to them", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead_1", assignedToId: "user_1" });
    await expect(assertLeadAccessible(session("FIELD_EXECUTIVE", "user_1"), "lead_1")).resolves.toMatchObject({ id: "lead_1" });
  });

  it("FIELD_EXECUTIVE can access an org-wide UNASSIGNED lead (spec item 12 'Unassigned Leads' tab)", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead_1", assignedToId: null });
    await expect(assertLeadAccessible(session("FIELD_EXECUTIVE", "user_1"), "lead_1")).resolves.toMatchObject({ id: "lead_1" });
  });

  it("FIELD_EXECUTIVE is forbidden from a lead assigned to a different employee", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead_1", assignedToId: "other_user" });
    await expect(assertLeadAccessible(session("FIELD_EXECUTIVE", "user_1"), "lead_1")).rejects.toMatchObject({ status: 403 } as Partial<ApiError>);
  });
});

describe("fieldExecutiveLeadReadWhere", () => {
  it("includes assigned and unassigned leads, matching isLeadAccessibleToUser", () => {
    const where = fieldExecutiveLeadReadWhere("user_1");
    expect(where).toEqual({ OR: [{ assignedToId: "user_1" }, { assignedToId: null }] });
    expect(isLeadAccessibleToUser({ assignedToId: "user_1" }, { id: "user_1", role: "FIELD_EXECUTIVE" })).toBe(true);
    expect(isLeadAccessibleToUser({ assignedToId: null }, { id: "user_1", role: "FIELD_EXECUTIVE" })).toBe(true);
    expect(isLeadAccessibleToUser({ assignedToId: "other" }, { id: "user_1", role: "FIELD_EXECUTIVE" })).toBe(false);
  });
});
