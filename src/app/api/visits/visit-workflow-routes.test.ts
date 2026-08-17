/**
 * Route-level guarantees for the visit workflow endpoints: which roles may
 * call what, what the payload validators reject, and that each route
 * delegates to the shared service rather than re-implementing the rules.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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
      if (err && typeof err === "object" && "issues" in err) return NextResponse.json({ error: "Validation failed" }, { status: 400 });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    },
  };
});

vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));

const startVisit = vi.fn();
const completeVisit = vi.fn();
const recordVisitPropertyOutcome = vi.fn();
const setPreferredProperties = vi.fn();
const rescheduleVisit = vi.fn();
const cancelVisit = vi.fn();
const scheduleVisitFromCatalogue = vi.fn();

vi.mock("@/lib/visits", () => ({
  startVisit: (...a: unknown[]) => startVisit(...a),
  completeVisit: (...a: unknown[]) => completeVisit(...a),
  recordVisitPropertyOutcome: (...a: unknown[]) => recordVisitPropertyOutcome(...a),
  setPreferredProperties: (...a: unknown[]) => setPreferredProperties(...a),
  rescheduleVisit: (...a: unknown[]) => rescheduleVisit(...a),
  cancelVisit: (...a: unknown[]) => cancelVisit(...a),
  scheduleVisitFromCatalogue: (...a: unknown[]) => scheduleVisitFromCatalogue(...a),
}));

const { POST: startRoute } = await import("./[id]/start/route");
const { POST: completeRoute } = await import("./[id]/complete/route");
const { PATCH: propertyRoute } = await import("./[id]/properties/[propertyId]/route");
const { PUT: preferredRoute } = await import("./[id]/preferred/route");
const { POST: rescheduleRoute } = await import("./[id]/reschedule/route");
const { POST: cancelRoute } = await import("./[id]/cancel/route");
const { POST: catalogueScheduleRoute } = await import("../catalogues/[id]/schedule-visit/route");

// Cast because the same helper feeds routes with different param shapes
// ({ id } vs { id, propertyId }); each call site supplies the keys its route
// actually reads.
const params = <T extends Record<string, string>>(extra: Record<string, string> = {}) => Promise.resolve({ id: "v1", ...extra }) as unknown as Promise<T>;

function req(body: unknown) {
  return new NextRequest(new Request("https://x.test/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser = { id: "admin1", role: "ADMIN" };
  startVisit.mockResolvedValue({ id: "v1", status: "IN_PROGRESS" });
  completeVisit.mockResolvedValue({ id: "v1", status: "COMPLETED" });
  recordVisitPropertyOutcome.mockResolvedValue({ id: "vp1", status: "VISITED" });
  setPreferredProperties.mockResolvedValue([]);
  rescheduleVisit.mockResolvedValue({ id: "v1" });
  cancelVisit.mockResolvedValue({ id: "v1", status: "CANCELLED" });
  scheduleVisitFromCatalogue.mockResolvedValue({ id: "v1" });
});

describe("POST /api/visits/[id]/start", () => {
  it("lets a field executive start their visit and passes the actor through", async () => {
    sessionUser = { id: "emp_sagar", role: "FIELD_EXECUTIVE" };
    const res = await startRoute(new Request("https://x.test"), { params: params() });
    expect(res.status).toBe(200);
    expect(startVisit).toHaveBeenCalledWith("v1", "org_default", sessionUser);
  });

  it("surfaces the service's error status rather than a generic 500", async () => {
    startVisit.mockRejectedValue(new MockApiError(404, "Visit not found"));
    const res = await startRoute(new Request("https://x.test"), { params: params() });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/visits/[id]/properties/[propertyId]", () => {
  it("records a visited property with a star rating and note", async () => {
    sessionUser = { id: "emp_sagar", role: "FIELD_EXECUTIVE" };
    const res = await propertyRoute(req({ status: "VISITED", reactionRating: 4, reactionNote: "Liked it" }), { params: params({ propertyId: "propF" }) });
    expect(res.status).toBe(200);
    expect(recordVisitPropertyOutcome).toHaveBeenCalledWith("v1", "propF", "org_default", sessionUser, expect.objectContaining({ status: "VISITED", reactionRating: 4, reactionNote: "Liked it" }));
  });

  it("accepts a visited property with no rating or note - both are optional", async () => {
    const res = await propertyRoute(req({ status: "VISITED" }), { params: params({ propertyId: "propF" }) });
    expect(res.status).toBe(200);
  });

  it("rejects a rating outside 1-5 and a fractional rating before reaching the service", async () => {
    for (const bad of [0, 6, 3.5]) {
      const res = await propertyRoute(req({ status: "VISITED", reactionRating: bad }), { params: params({ propertyId: "propF" }) });
      expect(res.status).toBe(400);
    }
    expect(recordVisitPropertyOutcome).not.toHaveBeenCalled();
  });

  it("rejects an unknown per-property status", async () => {
    const res = await propertyRoute(req({ status: "NOT_A_STATUS" }), { params: params({ propertyId: "propF" }) });
    expect(res.status).toBe(400);
  });

  it("accepts a skip with a reason", async () => {
    const res = await propertyRoute(req({ status: "SKIPPED", skipReason: "Owner unavailable" }), { params: params({ propertyId: "propK" }) });
    expect(res.status).toBe(200);
    expect(recordVisitPropertyOutcome).toHaveBeenCalledWith("v1", "propK", "org_default", sessionUser, expect.objectContaining({ skipReason: "Owner unavailable" }));
  });
});

describe("POST /api/visits/[id]/complete", () => {
  it("passes the overall rating, summary, and preferred properties through", async () => {
    sessionUser = { id: "emp_sagar", role: "FIELD_EXECUTIVE" };
    const res = await completeRoute(req({ overallRating: 5, summary: "Great visit", preferredPropertyIds: ["propM"] }), { params: params() });
    expect(res.status).toBe(200);
    expect(completeVisit).toHaveBeenCalledWith("v1", "org_default", sessionUser, { overallRating: 5, summary: "Great visit", preferredPropertyIds: ["propM"] });
  });

  it("tolerates an empty body - the overall rating is optional", async () => {
    const res = await completeRoute(new NextRequest(new Request("https://x.test/api", { method: "POST" })), { params: params() });
    expect(res.status).toBe(200);
  });

  it("rejects an invalid overall rating", async () => {
    const res = await completeRoute(req({ overallRating: 0 }), { params: params() });
    expect(res.status).toBe(400);
    expect(completeVisit).not.toHaveBeenCalled();
  });
});

describe("PUT /api/visits/[id]/preferred", () => {
  it("forwards the shortlist to the service", async () => {
    const res = await preferredRoute(req({ propertyIds: ["propM"] }), { params: params() });
    expect(res.status).toBe(200);
    expect(setPreferredProperties).toHaveBeenCalledWith("v1", "org_default", sessionUser, ["propM"]);
  });

  it("accepts an empty list, which clears the shortlist", async () => {
    const res = await preferredRoute(req({ propertyIds: [] }), { params: params() });
    expect(res.status).toBe(200);
  });
});

describe("reschedule and cancel are manager-only at the route boundary", () => {
  it("refuses a field executive on reschedule", async () => {
    sessionUser = { id: "emp_sagar", role: "FIELD_EXECUTIVE" };
    const res = await rescheduleRoute(req({ visitTime: "15:00" }), { params: params() });
    expect(res.status).toBe(403);
    expect(rescheduleVisit).not.toHaveBeenCalled();
  });

  it("refuses a field executive on cancel", async () => {
    sessionUser = { id: "emp_sagar", role: "FIELD_EXECUTIVE" };
    const res = await cancelRoute(req({ reason: "client busy" }), { params: params() });
    expect(res.status).toBe(403);
    expect(cancelVisit).not.toHaveBeenCalled();
  });

  it("allows an admin and a data manager to reschedule", async () => {
    for (const role of ["ADMIN", "DATA_MANAGER"]) {
      sessionUser = { id: "u1", role };
      const res = await rescheduleRoute(req({ visitDate: "2026-08-20T05:30:00.000Z", visitTime: "15:00", assignedToId: "emp2" }), { params: params() });
      expect(res.status).toBe(200);
    }
    expect(rescheduleVisit).toHaveBeenCalledTimes(2);
  });

  it("rejects an unparseable reschedule date", async () => {
    const res = await rescheduleRoute(req({ visitDate: "not-a-date" }), { params: params() });
    expect(res.status).toBe(400);
  });

  it("requires a cancellation reason of at least a few characters", async () => {
    const res = await cancelRoute(req({ reason: "x" }), { params: params() });
    expect(res.status).toBe(400);
    expect(cancelVisit).not.toHaveBeenCalled();
  });
});

describe("POST /api/catalogues/[id]/schedule-visit", () => {
  const body = { propertyIds: ["propF", "propM"], assignedToId: "emp_sagar", visitDate: "2026-08-18T05:30:00.000Z", visitTime: "11:00" };

  it("creates the visit with exactly the selected catalogue properties", async () => {
    const res = await catalogueScheduleRoute(req(body), { params: params({ id: "cat1" }) });
    expect(res.status).toBe(201);
    expect(scheduleVisitFromCatalogue).toHaveBeenCalledWith(
      expect.objectContaining({ catalogueShareId: "cat1", organizationId: "org_default", propertyIds: ["propF", "propM"], assignedToId: "emp_sagar", createdById: "admin1" })
    );
  });

  it("is refused for a field executive - scheduling is a manager action", async () => {
    sessionUser = { id: "emp_sagar", role: "FIELD_EXECUTIVE" };
    const res = await catalogueScheduleRoute(req(body), { params: params({ id: "cat1" }) });
    expect(res.status).toBe(403);
    expect(scheduleVisitFromCatalogue).not.toHaveBeenCalled();
  });

  it("requires at least one selected property", async () => {
    const res = await catalogueScheduleRoute(req({ ...body, propertyIds: [] }), { params: params({ id: "cat1" }) });
    expect(res.status).toBe(400);
    expect(scheduleVisitFromCatalogue).not.toHaveBeenCalled();
  });

  it("rejects an invalid visit date", async () => {
    const res = await catalogueScheduleRoute(req({ ...body, visitDate: "nonsense" }), { params: params({ id: "cat1" }) });
    expect(res.status).toBe(400);
  });

  it("carries the pending client request rows through so confirmation consumes them", async () => {
    const res = await catalogueScheduleRoute(
      req({ ...body, requestInteractionIds: ["req1", "req2"] }),
      { params: params({ id: "cat1" }) }
    );
    expect(res.status).toBe(201);
    expect(scheduleVisitFromCatalogue).toHaveBeenCalledWith(
      expect.objectContaining({ requestInteractionIds: ["req1", "req2"] })
    );
  });

  it("surfaces an already-confirmed request as 409, not as a second visit", async () => {
    scheduleVisitFromCatalogue.mockRejectedValueOnce(new MockApiError(409, "This visit request has already been scheduled."));
    const res = await catalogueScheduleRoute(
      req({ ...body, requestInteractionIds: ["req1"] }),
      { params: params({ id: "cat1" }) }
    );
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringMatching(/already been scheduled/) });
  });

  it("stays a request-free endpoint when no request ids are supplied", async () => {
    await catalogueScheduleRoute(req(body), { params: params({ id: "cat1" }) });
    expect(scheduleVisitFromCatalogue).toHaveBeenCalledWith(
      expect.objectContaining({ requestInteractionIds: undefined })
    );
  });
});
