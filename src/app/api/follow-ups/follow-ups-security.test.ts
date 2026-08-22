import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// simplified-role-workflow (continuation pass) - regression tests for two
// real security bugs found and fixed this pass:
//   1. PATCH /api/follow-ups/[id] had no organizationId scope and no
//      FIELD_EXECUTIVE ownership check at all.
//   2. POST /api/follow-ups never checked the caller could access the
//      target leadId.
// Also covers the human-facing follow-up types (VISIT_EXPECTED/
// GENERAL_FOLLOW_UP) and the new CANCELLED status actually working end to
// end through the Zod validator into the route.

const followUpFindFirst = vi.fn();
const followUpFindMany = vi.fn();
const followUpCreate = vi.fn();
const followUpUpdate = vi.fn();
const leadFindFirst = vi.fn();
const userFindFirst = vi.fn();
const activityCreate = vi.fn();
const notificationCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    followUp: {
      findFirst: (...a: unknown[]) => followUpFindFirst(...a),
      findMany: (...a: unknown[]) => followUpFindMany(...a),
      create: (...a: unknown[]) => followUpCreate(...a),
      update: (...a: unknown[]) => followUpUpdate(...a),
    },
    lead: { findFirst: (...a: unknown[]) => leadFindFirst(...a) },
    user: { findFirst: (...a: unknown[]) => userFindFirst(...a) },
  },
}));

let sessionUser: { id: string; role: string; organizationId: string } = { id: "fe_1", role: "FIELD_EXECUTIVE", organizationId: "org_a" };

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
    requireSession: async () => ({ user: sessionUser }),
    handleApiError: (err: unknown) => {
      if (err instanceof MockApiError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err && typeof err === "object" && "issues" in err) return NextResponse.json({ error: "Validation failed" }, { status: 400 });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    },
  };
});

vi.mock("@/lib/organization", () => ({ getOrganizationId: (user: { organizationId: string }) => user.organizationId }));
vi.mock("@/lib/activity", () => ({ logActivity: (...a: unknown[]) => activityCreate(...a) }));
vi.mock("@/lib/notifications", () => ({ createNotification: (...a: unknown[]) => notificationCreate(...a) }));

// assertLeadAccessible: real module, but it hits prisma.lead.findFirst which
// is mocked above - exercised for real rather than re-mocked, so this test
// actually proves the wiring, not just that a mock was called.
vi.mock("@/lib/lead-access", async () => {
  const actual = await vi.importActual<typeof import("@/lib/lead-access")>("@/lib/lead-access");
  return actual;
});

const { GET: getFollowUps, POST: createFollowUp } = await import("./route");
const { PATCH: patchFollowUp } = await import("./[id]/route");

function postReq(body: unknown) {
  return new NextRequest(new Request("https://x.test/api/follow-ups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}
function getReq() {
  return new NextRequest(new Request("https://x.test/api/follow-ups"));
}
function patchReq(body: unknown) {
  return new NextRequest(new Request("https://x.test/api/follow-ups/fu_1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}
function params() {
  return { params: Promise.resolve({ id: "fu_1" }) };
}

const VALID_CREATE_BODY = { leadId: "lead_1", type: "PHONE_CALL", dueDate: "2026-08-25T10:00:00.000Z" };
const EXISTING_FOLLOWUP = { id: "fu_1", organizationId: "org_a", ownerId: "fe_1", status: "PENDING", leadId: "lead_1", dueDate: new Date("2026-08-22T10:00:00.000Z") };

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = { id: "fe_1", role: "FIELD_EXECUTIVE", organizationId: "org_a" };
  followUpCreate.mockResolvedValue({ id: "fu_new" });
  followUpUpdate.mockResolvedValue({ id: "fu_1" });
  followUpFindMany.mockResolvedValue([]);
});

describe("POST /api/follow-ups - lead access enforcement (bug fix)", () => {
  it("404s a cross-org lead rather than creating a follow-up against it", async () => {
    leadFindFirst.mockResolvedValue(null); // assertLeadAccessible's own-org lookup fails
    const res = await createFollowUp(postReq(VALID_CREATE_BODY));
    expect(res.status).toBe(404);
    expect(followUpCreate).not.toHaveBeenCalled();
  });

  it("403s a FIELD_EXECUTIVE creating a follow-up for a lead assigned to someone else", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead_1", organizationId: "org_a", assignedToId: "other_fe" });
    const res = await createFollowUp(postReq(VALID_CREATE_BODY));
    expect(res.status).toBe(403);
    expect(followUpCreate).not.toHaveBeenCalled();
  });

  it("allows a FIELD_EXECUTIVE to create a follow-up for their own assigned lead", async () => {
    leadFindFirst.mockResolvedValue({ id: "lead_1", organizationId: "org_a", assignedToId: "fe_1" });
    const res = await createFollowUp(postReq(VALID_CREATE_BODY));
    expect(res.status).toBe(201);
    expect(followUpCreate).toHaveBeenCalled();
  });

  it("allows ADMIN to create a follow-up for any lead in the organization", async () => {
    sessionUser = { id: "admin_1", role: "ADMIN", organizationId: "org_a" };
    leadFindFirst.mockResolvedValue({ id: "lead_1", organizationId: "org_a", assignedToId: "someone_else" });
    const res = await createFollowUp(postReq(VALID_CREATE_BODY));
    expect(res.status).toBe(201);
  });

  it.each(["VISIT_EXPECTED", "GENERAL_FOLLOW_UP"])("accepts the human-facing follow-up type %s (validator fix)", async (type) => {
    leadFindFirst.mockResolvedValue({ id: "lead_1", organizationId: "org_a", assignedToId: "fe_1" });
    const res = await createFollowUp(postReq({ ...VALID_CREATE_BODY, type }));
    expect(res.status).toBe(201);
    expect(followUpCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type }) }));
  });
});

describe("PATCH /api/follow-ups/[id] - org/ownership enforcement (bug fix)", () => {
  it("404s when the follow-up does not exist in the caller's organization (cross-org write blocked)", async () => {
    followUpFindFirst.mockResolvedValue(null);
    const res = await patchFollowUp(patchReq({ status: "COMPLETED" }), params());
    expect(res.status).toBe(404);
    expect(followUpUpdate).not.toHaveBeenCalled();
    // Proves the fix actually scopes by organization, not just id.
    expect(followUpFindFirst).toHaveBeenCalledWith({ where: { id: "fu_1", organizationId: "org_a" } });
  });

  it("403s a FIELD_EXECUTIVE patching a follow-up owned by a different employee", async () => {
    followUpFindFirst.mockResolvedValue({ id: "fu_1", organizationId: "org_a", ownerId: "other_fe", status: "PENDING", leadId: "lead_1", dueDate: new Date() });
    const res = await patchFollowUp(patchReq({ status: "COMPLETED" }), params());
    expect(res.status).toBe(403);
    expect(followUpUpdate).not.toHaveBeenCalled();
  });

  it("allows a FIELD_EXECUTIVE to complete their own follow-up", async () => {
    followUpFindFirst.mockResolvedValue({ id: "fu_1", organizationId: "org_a", ownerId: "fe_1", status: "PENDING", leadId: "lead_1", dueDate: new Date() });
    const res = await patchFollowUp(patchReq({ status: "COMPLETED" }), params());
    expect(res.status).toBe(200);
    expect(followUpUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED" }) }));
  });

  it("accepts CANCELLED as a status (new enum value) and logs it distinctly from COMPLETED", async () => {
    followUpFindFirst.mockResolvedValue({ id: "fu_1", organizationId: "org_a", ownerId: "fe_1", status: "PENDING", leadId: "lead_1", dueDate: new Date() });
    const res = await patchFollowUp(patchReq({ status: "CANCELLED" }), params());
    expect(res.status).toBe(200);
    expect(followUpUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CANCELLED", completedAt: null }) }));
    expect(activityCreate).toHaveBeenCalledWith(expect.objectContaining({ description: "Follow-up cancelled" }));
  });

  it("a reschedule (dueDate change) updates the SAME row rather than a caller creating a second one", async () => {
    const original = new Date("2026-08-22T10:00:00.000Z");
    followUpFindFirst.mockResolvedValue({ id: "fu_1", organizationId: "org_a", ownerId: "fe_1", status: "PENDING", leadId: "lead_1", dueDate: original });
    const res = await patchFollowUp(patchReq({ dueDate: "2026-08-25T10:00:00.000Z" }), params());
    expect(res.status).toBe(200);
    // Only ever calls update() on the existing id - never create().
    expect(followUpUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "fu_1" } }));
    expect(followUpCreate).not.toHaveBeenCalled();
  });
});

// simplified-role-workflow (targeted fix pass, Blocker A) - the follow-up
// PATCH re-pointing gap: leadId was previously writable with zero
// re-validation (unlike PATCH /api/visits/[id]), and ownerId accepted any
// string with no existence/org/role check at all.
describe("PATCH /api/follow-ups/[id] - leadId immutability", () => {
  it("rejects a client-supplied leadId that differs from the existing one, with a clear 400 (not a silent drop)", async () => {
    followUpFindFirst.mockResolvedValue(EXISTING_FOLLOWUP);
    const res = await patchFollowUp(patchReq({ leadId: "some_other_lead", status: "COMPLETED" }), params());
    expect(res.status).toBe(400);
    expect(followUpUpdate).not.toHaveBeenCalled();
  });

  it("allows a PATCH that redundantly sends the SAME leadId the follow-up already has", async () => {
    followUpFindFirst.mockResolvedValue(EXISTING_FOLLOWUP);
    const res = await patchFollowUp(patchReq({ leadId: "lead_1", status: "COMPLETED" }), params());
    expect(res.status).toBe(200);
  });

  it("never passes leadId through to prisma.followUp.update even when omitted from the body", async () => {
    followUpFindFirst.mockResolvedValue(EXISTING_FOLLOWUP);
    await patchFollowUp(patchReq({ status: "COMPLETED" }), params());
    const updateData = followUpUpdate.mock.calls[0][0].data;
    expect(updateData).not.toHaveProperty("leadId");
  });
});

describe("PATCH /api/follow-ups/[id] - ownerId validation", () => {
  it("403s a FIELD_EXECUTIVE trying to reassign their own follow-up to another employee", async () => {
    followUpFindFirst.mockResolvedValue(EXISTING_FOLLOWUP);
    const res = await patchFollowUp(patchReq({ ownerId: "other_fe" }), params());
    expect(res.status).toBe(403);
    expect(followUpUpdate).not.toHaveBeenCalled();
  });

  it("allows a FIELD_EXECUTIVE to PATCH with ownerId set to themself", async () => {
    followUpFindFirst.mockResolvedValue(EXISTING_FOLLOWUP);
    userFindFirst.mockResolvedValue({ id: "fe_1" });
    const res = await patchFollowUp(patchReq({ ownerId: "fe_1" }), params());
    expect(res.status).toBe(200);
  });

  it("rejects an ownerId that does not resolve to an active, same-organization user (ADMIN caller)", async () => {
    sessionUser = { id: "admin_1", role: "ADMIN", organizationId: "org_a" };
    followUpFindFirst.mockResolvedValue({ ...EXISTING_FOLLOWUP, ownerId: "fe_1" });
    userFindFirst.mockResolvedValue(null); // not found / wrong org / inactive
    const res = await patchFollowUp(patchReq({ ownerId: "nonexistent_or_cross_org_user" }), params());
    expect(res.status).toBe(400);
    expect(followUpUpdate).not.toHaveBeenCalled();
    expect(userFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "nonexistent_or_cross_org_user", organizationId: "org_a", status: "ACTIVE" }) }));
  });

  it("allows DATA_MANAGER to reassign a follow-up to a valid same-org employee (preserves existing ADMIN/DM behavior)", async () => {
    sessionUser = { id: "dm_1", role: "DATA_MANAGER", organizationId: "org_a" };
    followUpFindFirst.mockResolvedValue({ ...EXISTING_FOLLOWUP, ownerId: "fe_1" });
    userFindFirst.mockResolvedValue({ id: "fe_2" });
    const res = await patchFollowUp(patchReq({ ownerId: "fe_2" }), params());
    expect(res.status).toBe(200);
    expect(followUpUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ ownerId: "fe_2" }) }));
  });

  it("allows clearing ownerId to null", async () => {
    sessionUser = { id: "admin_1", role: "ADMIN", organizationId: "org_a" };
    followUpFindFirst.mockResolvedValue({ ...EXISTING_FOLLOWUP, ownerId: "fe_1" });
    const res = await patchFollowUp(patchReq({ ownerId: null }), params());
    expect(res.status).toBe(200);
    expect(userFindFirst).not.toHaveBeenCalled();
    expect(followUpUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ ownerId: null }) }));
  });
});

describe("GET /api/follow-ups - narrow lead projection (Blocker A)", () => {
  it("selects only id/clientName/phone from the related lead, never the full row", async () => {
    const res = await getFollowUps(getReq());
    expect(res.status).toBe(200);
    const select = followUpFindMany.mock.calls[0][0].include.lead.select;
    expect(select).toEqual({ id: true, clientName: true, phone: true });
  });

  it("scopes FIELD_EXECUTIVE to their own follow-ups only", async () => {
    await getFollowUps(getReq());
    expect(followUpFindMany.mock.calls[0][0].where.ownerId).toBe("fe_1");
  });
});
