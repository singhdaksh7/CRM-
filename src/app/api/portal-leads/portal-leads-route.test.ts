import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Portal lead review API. Provenance must survive the review workflow: an
 * event linked to an existing CRM lead keeps its provider/external ids, and
 * nothing here ever merges an ambiguous contact on its own.
 */

const eventFindMany = vi.fn();
const eventFindFirst = vi.fn();
const eventUpdate = vi.fn();
const leadFindFirst = vi.fn();
const recordAudit = vi.fn();
let session = { id: "admin1", role: "ADMIN" };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    externalLeadEvent: {
      findMany: (...a: unknown[]) => eventFindMany(...a),
      findFirst: (...a: unknown[]) => eventFindFirst(...a),
      update: (...a: unknown[]) => eventUpdate(...a),
    },
    lead: { findFirst: (...a: unknown[]) => leadFindFirst(...a) },
  },
}));

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
    requireSession: async (roles: string[]) => {
      if (!roles.includes(session.role)) throw new MockApiError(403, "Forbidden");
      return { user: session };
    },
    handleApiError: (err: unknown) => {
      if (err instanceof MockApiError) return NextResponse.json({ error: err.message }, { status: err.status });
      if (err && typeof err === "object" && "issues" in err) return NextResponse.json({ error: "Validation failed" }, { status: 400 });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    },
  };
});

vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "org_default" }));
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));

const { GET } = await import("./route");
const { PATCH } = await import("./[id]/route");

const events = [
  { id: "evt1", provider: "HOUSING", externalLeadId: "HSG-1", ingestionStatus: "RECEIVED", lead: { id: "lead1", leadCode: "L-1", clientName: "A", assignedToId: "fe1" } },
  { id: "evt2", provider: "OLX", externalLeadId: "OLX-1", ingestionStatus: "AMBIGUOUS", lead: null },
  { id: "evt3", provider: "MAGICBRICKS", externalLeadId: "MB-1", ingestionStatus: "RECEIVED", lead: { id: "lead2", leadCode: "L-2", clientName: "B", assignedToId: "fe2" } },
];

function listRequest(query = "") {
  return new NextRequest(new Request(`https://x.test/api/portal-leads${query}`));
}
function patchRequest(body: unknown) {
  return new NextRequest(new Request("https://x.test/api/portal-leads/evt1", { method: "PATCH", body: JSON.stringify(body) }));
}
const ctx = { params: Promise.resolve({ id: "evt1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  session = { id: "admin1", role: "ADMIN" };
  eventFindMany.mockResolvedValue(events);
  eventFindFirst.mockResolvedValue({ id: "evt1", organizationId: "org_default", provider: "HOUSING", externalLeadId: "HSG-1", ingestionStatus: "AMBIGUOUS" });
  eventUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "evt1", ...data }));
  leadFindFirst.mockResolvedValue({ id: "lead9", organizationId: "org_default" });
});

describe("GET /api/portal-leads", () => {
  it("scopes every query to the caller's organization", async () => {
    await GET(listRequest());
    expect(eventFindMany.mock.calls[0][0].where.organizationId).toBe("org_default");
  });

  it("returns the provenance fields the review UI needs", async () => {
    const body = await (await GET(listRequest())).json();
    expect(body.events[0]).toMatchObject({ provider: "HOUSING", externalLeadId: "HSG-1" });
  });

  it("shows an admin every event, including unlinked ambiguous ones", async () => {
    const body = await (await GET(listRequest())).json();
    expect(body.events.map((e: { id: string }) => e.id)).toEqual(["evt1", "evt2", "evt3"]);
  });

  it("shows a field executive only events for their own assigned leads", async () => {
    session = { id: "fe1", role: "FIELD_EXECUTIVE" };
    const body = await (await GET(listRequest())).json();
    expect(body.events.map((e: { id: string }) => e.id)).toEqual(["evt1"]);
  });

  it("hides unlinked ambiguous events from a field executive", async () => {
    session = { id: "fe1", role: "FIELD_EXECUTIVE" };
    const body = await (await GET(listRequest())).json();
    expect(body.events.map((e: { id: string }) => e.id)).not.toContain("evt2");
  });

  it("passes provider and status filters through to the scoped query", async () => {
    await GET(listRequest("?provider=HOUSING&status=AMBIGUOUS"));
    expect(eventFindMany.mock.calls[0][0].where).toMatchObject({ organizationId: "org_default", provider: "HOUSING", ingestionStatus: "AMBIGUOUS" });
  });
});

describe("PATCH /api/portal-leads/[id]", () => {
  it("links an ambiguous event to an operator-chosen lead", async () => {
    const res = await PATCH(patchRequest({ action: "LINK_EXISTING", leadId: "lead9" }), ctx);
    expect(res.status).toBe(200);
    expect(eventUpdate.mock.calls[0][0].data).toMatchObject({ leadId: "lead9", ingestionStatus: "MATCHED_EXISTING", resolvedById: "admin1" });
  });

  it("never guesses a lead - LINK_EXISTING without a leadId is rejected", async () => {
    const res = await PATCH(patchRequest({ action: "LINK_EXISTING" }), ctx);
    expect(res.status).toBe(400);
    expect(eventUpdate).not.toHaveBeenCalled();
  });

  it("refuses to link a lead from another organization", async () => {
    leadFindFirst.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ action: "LINK_EXISTING", leadId: "lead-elsewhere" }), ctx);
    expect(res.status).toBe(404);
    expect(eventUpdate).not.toHaveBeenCalled();
  });

  it("looks the event up only within the caller's organization", async () => {
    await PATCH(patchRequest({ action: "REJECT" }), ctx);
    expect(eventFindFirst.mock.calls[0][0].where).toEqual({ id: "evt1", organizationId: "org_default" });
  });

  it("404s instead of acting on an event outside the organization", async () => {
    eventFindFirst.mockResolvedValue(null);
    const res = await PATCH(patchRequest({ action: "REJECT" }), ctx);
    expect(res.status).toBe(404);
    expect(eventUpdate).not.toHaveBeenCalled();
  });

  it("keeps a rejected event as history rather than deleting it", async () => {
    await PATCH(patchRequest({ action: "REJECT" }), ctx);
    expect(eventUpdate.mock.calls[0][0].data).toMatchObject({ ingestionStatus: "REJECTED", resolvedById: "admin1" });
  });

  it("re-queues a retry for review and counts the attempt", async () => {
    await PATCH(patchRequest({ action: "RETRY" }), ctx);
    expect(eventUpdate.mock.calls[0][0].data).toMatchObject({ ingestionStatus: "NEEDS_REVIEW", attemptCount: { increment: 1 }, failureReason: null });
  });

  it("rejects an unknown action", async () => {
    const res = await PATCH(patchRequest({ action: "AUTO_MERGE" }), ctx);
    expect(res.status).toBe(400);
    expect(eventUpdate).not.toHaveBeenCalled();
  });

  it("audits every review decision", async () => {
    await PATCH(patchRequest({ action: "REJECT" }), ctx);
    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(recordAudit.mock.calls[0][0]).toMatchObject({ entityType: "ExternalLeadEvent", entityId: "evt1" });
  });

  it("is refused for a field executive - review is an admin/data-manager decision", async () => {
    session = { id: "fe1", role: "FIELD_EXECUTIVE" };
    const res = await PATCH(patchRequest({ action: "REJECT" }), ctx);
    expect(res.status).toBe(403);
    expect(eventUpdate).not.toHaveBeenCalled();
  });

  it("is allowed for a data manager", async () => {
    session = { id: "dm1", role: "DATA_MANAGER" };
    expect((await PATCH(patchRequest({ action: "REJECT" }), ctx)).status).toBe(200);
  });
});
