import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const visitFindFirst = vi.fn();
const visitCreate = vi.fn();
const visitUpdate = vi.fn();
const leadUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    visit: {
      findFirst: (...a: unknown[]) => visitFindFirst(...a),
      create: (...a: unknown[]) => visitCreate(...a),
      update: (...a: unknown[]) => visitUpdate(...a),
    },
    lead: { update: (...a: unknown[]) => leadUpdate(...a) },
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
    requireSession: async () => ({ user: sessionUser }),
    handleApiError: (err: unknown) => {
      if (err instanceof MockApiError) return NextResponse.json({ error: err.message }, { status: err.status });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    },
  };
});

vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));
vi.mock("@/lib/activity", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/scoring", () => ({ recalculateLeadScore: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));
const recordAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));
const appendPropertyTimelineEvent = vi.fn();
vi.mock("@/lib/property-timeline", () => ({ appendPropertyTimelineEvent: (...a: unknown[]) => appendPropertyTimelineEvent(...a) }));
vi.mock("@/lib/automation-rules", () => ({ runAutomationRules: vi.fn() }));

const checkVisitConflict = vi.fn();
vi.mock("@/lib/visit-conflict", () => ({ checkVisitConflict: (...a: unknown[]) => checkVisitConflict(...a) }));

const { POST } = await import("./route");
const { PATCH } = await import("./[id]/route");

function jsonRequest(body: unknown) {
  return new NextRequest(new Request("https://x.test/api/visits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}

const VALID_BODY = {
  leadId: "lead1",
  propertyId: "prop1",
  assignedToId: "emp1",
  visitDate: "2026-02-10",
  visitTime: "10:00",
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = { id: "admin1", role: "ADMIN" };
});

describe("POST /api/visits - conflict handling", () => {
  it("creates the visit normally when there is no conflict", async () => {
    checkVisitConflict.mockResolvedValue({ status: "NONE", detail: null, travelDurationMinutes: null, travelDistanceMeters: null, routeSource: "NONE" });
    visitCreate.mockResolvedValue({ id: "v1", lead: { clientName: "Rahul" }, property: { title: "Flat" } });

    const res = await POST(jsonRequest(VALID_BODY));
    expect(res.status).toBe(201);
    expect(visitCreate).toHaveBeenCalledTimes(1);
  });

  it("returns 409 with the conflict details when a warning is detected and no override is provided", async () => {
    checkVisitConflict.mockResolvedValue({ status: "WARNING", detail: "Not enough travel time", travelDurationMinutes: 30, travelDistanceMeters: 5000, routeSource: "GOOGLE" });

    const res = await POST(jsonRequest(VALID_BODY));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.requiresOverride).toBe(true);
    expect(visitCreate).not.toHaveBeenCalled();
  });

  it("requires an overrideReason when overriding a conflict", async () => {
    checkVisitConflict.mockResolvedValue({ status: "WARNING", detail: "conflict", travelDurationMinutes: 30, travelDistanceMeters: 5000, routeSource: "GOOGLE" });

    const res = await POST(jsonRequest({ ...VALID_BODY, overrideConflict: true }));
    expect(res.status).toBe(400);
    expect(visitCreate).not.toHaveBeenCalled();
  });

  it("creates the visit as OVERRIDDEN and audits it when overrideConflict + reason are provided", async () => {
    checkVisitConflict.mockResolvedValue({ status: "WARNING", detail: "conflict", travelDurationMinutes: 30, travelDistanceMeters: 5000, routeSource: "GOOGLE" });
    visitCreate.mockResolvedValue({ id: "v1", lead: { clientName: "Rahul" }, property: { title: "Flat" } });

    const res = await POST(jsonRequest({ ...VALID_BODY, overrideConflict: true, overrideReason: "Client insisted on this exact time" }));
    expect(res.status).toBe(201);
    expect(visitCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ conflictStatus: "OVERRIDDEN", conflictOverrideReason: "Client insisted on this exact time" }) }));
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ newValues: expect.objectContaining({ event: "visit_conflict_overridden" }) }));
  });

  it("skips the conflict check entirely when no employee is assigned", async () => {
    visitCreate.mockResolvedValue({ id: "v1", lead: { clientName: "Rahul" }, property: { title: "Flat" } });
    const res = await POST(jsonRequest({ ...VALID_BODY, assignedToId: undefined }));
    expect(res.status).toBe(201);
    expect(checkVisitConflict).not.toHaveBeenCalled();
  });

  it("appends a VISIT_SCHEDULED property timeline event on creation", async () => {
    checkVisitConflict.mockResolvedValue({ status: "NONE", detail: null, travelDurationMinutes: null, travelDistanceMeters: null, routeSource: "NONE" });
    visitCreate.mockResolvedValue({ id: "v1", lead: { clientName: "Rahul" }, property: { title: "Flat" } });
    await POST(jsonRequest(VALID_BODY));
    expect(appendPropertyTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({ propertyId: "prop1", eventType: "VISIT_SCHEDULED" }));
  });
});

describe("PATCH /api/visits/[id] - conflict handling on reschedule", () => {
  function patchRequest(body: unknown) {
    return new NextRequest(new Request("https://x.test/api/visits/v1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  }

  it("does not re-check conflicts for a non-scheduling field update (e.g. status only)", async () => {
    visitFindFirst.mockResolvedValue({ id: "v1", organizationId: "org_default", assignedToId: "emp1", leadId: "lead1", status: "SCHEDULED", visitDate: new Date(), visitTime: "10:00", propertyId: "prop1" });
    visitUpdate.mockResolvedValue({ id: "v1" });

    const res = await PATCH(patchRequest({ status: "CONFIRMED" }), { params: Promise.resolve({ id: "v1" }) });
    expect(res.status).toBe(200);
    expect(checkVisitConflict).not.toHaveBeenCalled();
  });

  it("returns 409 when rescheduling creates a conflict, without updating the visit", async () => {
    visitFindFirst.mockResolvedValue({ id: "v1", organizationId: "org_default", assignedToId: "emp1", leadId: "lead1", status: "SCHEDULED", visitDate: new Date(), visitTime: "10:00", propertyId: "prop1" });
    checkVisitConflict.mockResolvedValue({ status: "WARNING", detail: "conflict", travelDurationMinutes: 20, travelDistanceMeters: 3000, routeSource: "GOOGLE" });

    const res = await PATCH(patchRequest({ visitTime: "10:15" }), { params: Promise.resolve({ id: "v1" }) });
    expect(res.status).toBe(409);
    expect(visitUpdate).not.toHaveBeenCalled();
  });

  it("denies a Field Executive from overriding a conflict on their own visit", async () => {
    sessionUser = { id: "fe1", role: "FIELD_EXECUTIVE" as never };
    visitFindFirst.mockResolvedValue({ id: "v1", organizationId: "org_default", assignedToId: "fe1", leadId: "lead1", status: "SCHEDULED", visitDate: new Date(), visitTime: "10:00", propertyId: "prop1" });
    checkVisitConflict.mockResolvedValue({ status: "WARNING", detail: "conflict", travelDurationMinutes: 20, travelDistanceMeters: 3000, routeSource: "GOOGLE" });

    const res = await PATCH(patchRequest({ visitTime: "10:15", overrideConflict: true, overrideReason: "need to move" }), { params: Promise.resolve({ id: "v1" }) });
    expect(res.status).toBe(403);
  });

  it("allows Admin to override a reschedule conflict with a reason", async () => {
    visitFindFirst.mockResolvedValue({ id: "v1", organizationId: "org_default", assignedToId: "emp1", leadId: "lead1", status: "SCHEDULED", visitDate: new Date(), visitTime: "10:00", propertyId: "prop1" });
    checkVisitConflict.mockResolvedValue({ status: "WARNING", detail: "conflict", travelDurationMinutes: 20, travelDistanceMeters: 3000, routeSource: "GOOGLE" });
    visitUpdate.mockResolvedValue({ id: "v1" });

    const res = await PATCH(patchRequest({ visitTime: "10:15", overrideConflict: true, overrideReason: "client requested" }), { params: Promise.resolve({ id: "v1" }) });
    expect(res.status).toBe(200);
    expect(visitUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ conflictStatus: "OVERRIDDEN" }) }));
  });
});

describe("PATCH /api/visits/[id] - Phase 4 outcome handling", () => {
  function patchRequest(body: unknown) {
    return new NextRequest(new Request("https://x.test/api/visits/v1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  }

  beforeEach(() => {
    visitFindFirst.mockResolvedValue({ id: "v1", organizationId: "org_default", assignedToId: "emp1", leadId: "lead1", status: "SCHEDULED", visitDate: new Date(), visitTime: "10:00", propertyId: "prop1" });
    visitUpdate.mockResolvedValue({ id: "v1" });
  });

  it.each([
    ["SHORTLISTED", "QUALIFIED"],
    ["REJECTED", "NOT_INTERESTED"],
    ["NEGOTIATION_IN_PROGRESS", "NEGOTIATION"],
  ])("maps the new %s outcome to lead status %s", async (outcome, expectedStatus) => {
    const res = await PATCH(patchRequest({ status: "COMPLETED", outcome }), { params: Promise.resolve({ id: "v1" }) });
    expect(res.status).toBe(200);
    expect(leadUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: expectedStatus }) }));
  });

  it("falls through to VISIT_COMPLETED for FOLLOW_UP_NEEDED (intentionally unmapped)", async () => {
    await PATCH(patchRequest({ status: "COMPLETED", outcome: "FOLLOW_UP_NEEDED" }), { params: Promise.resolve({ id: "v1" }) });
    expect(leadUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "VISIT_COMPLETED" }) }));
  });

  it("logs VISIT_OUTCOME_RECORDED, records audit, and appends a property timeline event when an outcome is recorded", async () => {
    await PATCH(patchRequest({ status: "COMPLETED", outcome: "CUSTOMER_NO_SHOW" }), { params: Promise.resolve({ id: "v1" }) });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ newValues: expect.objectContaining({ event: "visit_outcome_recorded", outcome: "CUSTOMER_NO_SHOW" }) }));
    expect(appendPropertyTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({ propertyId: "prop1", eventType: "VISIT_COMPLETED", toValue: "CUSTOMER_NO_SHOW" }));
  });

  it("does not append a timeline event or outcome audit when completing without an outcome", async () => {
    await PATCH(patchRequest({ status: "COMPLETED" }), { params: Promise.resolve({ id: "v1" }) });
    expect(appendPropertyTimelineEvent).not.toHaveBeenCalled();
  });
});
