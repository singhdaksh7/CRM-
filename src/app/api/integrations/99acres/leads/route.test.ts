import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * 99acres inbound lead webhook. 99acres gave us no API documentation, so the
 * contract under test is: bearer-authenticated, tolerant of unknown payloads,
 * raw (sanitised) payload always preserved, idempotent, tenant-safe, and never
 * contacts the customer.
 */

const SECRET = "test-secret-0123456789abcdef0123456789abcdef";

const eventFindUnique = vi.fn();
const eventFindFirst = vi.fn();
const eventCreate = vi.fn();
const eventUpdate = vi.fn();
const leadFindMany = vi.fn();
const leadCreate = vi.fn();
const customerContactFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    externalLeadEvent: {
      findUnique: (...a: unknown[]) => eventFindUnique(...a),
      findFirst: (...a: unknown[]) => eventFindFirst(...a),
      create: (...a: unknown[]) => eventCreate(...a),
      update: (...a: unknown[]) => eventUpdate(...a),
    },
    lead: { findMany: (...a: unknown[]) => leadFindMany(...a), create: (...a: unknown[]) => leadCreate(...a) },
    customerContact: { findUnique: (...a: unknown[]) => customerContactFindUnique(...a) },
  },
}));

let rateLimitAllowed = true;
const checkRateLimit = vi.fn(async () => ({ allowed: rateLimitAllowed, limit: 120, remaining: 119, resetSeconds: 60 }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => (checkRateLimit as unknown as (...x: unknown[]) => unknown)(...a),
  clientIp: () => "203.0.113.20",
  rateLimitResponse: () => new Response("RATE LIMITED", { status: 429 }),
}));

const recordAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock("@/lib/logger", () => ({ logger }));

const autoAssignLead = vi.fn();
vi.mock("@/lib/assignment", () => ({ autoAssignLead: (...a: unknown[]) => autoAssignLead(...a) }));
const logActivity = vi.fn();
vi.mock("@/lib/activity", () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));
const recalculateLeadScore = vi.fn();
vi.mock("@/lib/scoring", () => ({ recalculateLeadScore: (...a: unknown[]) => recalculateLeadScore(...a) }));
const runMatchingForLead = vi.fn();
vi.mock("@/lib/lead-matching", () => ({ runMatchingForLead: (...a: unknown[]) => runMatchingForLead(...a) }));
const runAutomationRules = vi.fn();
vi.mock("@/lib/automation-rules", () => ({ runAutomationRules: (...a: unknown[]) => runAutomationRules(...a) }));
const notifyRoles = vi.fn();
vi.mock("@/lib/notifications", () => ({ notifyRoles: (...a: unknown[]) => notifyRoles(...a) }));

const { POST } = await import("./route");

const URL_ = "https://crm.kpproperties.co.in/api/integrations/99acres/leads";

const normalLead = {
  leadId: "99A-884213",
  name: "Rahul Sharma",
  mobile: "+91 98765 43210",
  email: "rahul@example.com",
  message: "Interested, please call",
  listingId: "L-5521",
  projectName: "Green Heights",
  locality: "Janakpuri",
  city: "Delhi",
  budgetMin: 5000000,
  budgetMax: 8000000,
  bhk: "3 BHK",
  propertyType: "Apartment",
  propertyCategory: "Residential",
  transactionType: "Buy",
  createdAt: "2026-10-01T10:15:00Z",
};

function makeRequest(body: unknown, init?: { headers?: Record<string, string>; rawBody?: string; auth?: string | null; contentType?: string }) {
  const text = init?.rawBody ?? (typeof body === "string" ? body : JSON.stringify(body));
  const headers: Record<string, string> = { "content-type": init?.contentType ?? "application/json" };
  if (init?.auth !== null) headers.authorization = init?.auth ?? `Bearer ${SECRET}`;
  return new NextRequest(new Request(URL_, { method: "POST", headers: { ...headers, ...init?.headers }, body: text }));
}

async function body(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitAllowed = true;
  process.env.ACRES_99_WEBHOOK_SECRET = SECRET;
  delete process.env.ACRES_99_ORGANIZATION_ID;
  eventFindUnique.mockResolvedValue(null);
  eventFindFirst.mockResolvedValue(null);
  leadFindMany.mockResolvedValue([]);
  customerContactFindUnique.mockResolvedValue(null);
  eventCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "evt_1", ...data }));
  eventUpdate.mockResolvedValue({});
  leadCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "lead_1", ...data }));
  autoAssignLead.mockResolvedValue(null);
});

afterEach(() => {
  delete process.env.ACRES_99_WEBHOOK_SECRET;
  vi.unstubAllGlobals();
});

describe("authentication", () => {
  it("accepts the correct bearer secret", async () => {
    const res = await POST(makeRequest(normalLead));
    expect(res.status).toBe(200);
  });

  it("401s when no Authorization header is sent, without touching the database", async () => {
    const res = await POST(makeRequest(normalLead, { auth: null }));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Bearer");
    expect(eventCreate).not.toHaveBeenCalled();
    expect(leadCreate).not.toHaveBeenCalled();
  });

  it("401s on a non-Bearer scheme", async () => {
    const res = await POST(makeRequest(normalLead, { auth: `Basic ${SECRET}` }));
    expect(res.status).toBe(401);
  });

  it("403s on a wrong secret, of any length, and never logs the attempted value", async () => {
    for (const wrong of ["nope", `${SECRET}x`, SECRET.slice(0, -1)]) {
      const res = await POST(makeRequest(normalLead, { auth: `Bearer ${wrong}` }));
      expect(res.status).toBe(403);
    }
    expect(eventCreate).not.toHaveBeenCalled();
    expect(JSON.stringify([logger.warn.mock.calls, logger.error.mock.calls, logger.info.mock.calls])).not.toContain("nope");
  });

  it("fails closed (503) when the secret is not configured, even for a request that sends no credentials", async () => {
    delete process.env.ACRES_99_WEBHOOK_SECRET;
    const res = await POST(makeRequest(normalLead, { auth: null }));
    expect(res.status).toBe(503);
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it("rejects plain http in production, trusting the proxy's forwarded scheme", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const http = await POST(makeRequest(normalLead, { headers: { "x-forwarded-proto": "http" } }));
    expect(http.status).toBe(403);
    const https = await POST(makeRequest(normalLead, { headers: { "x-forwarded-proto": "https" } }));
    expect(https.status).toBe(200);
    vi.unstubAllEnvs();
  });
});

describe("rate limiting", () => {
  it("429s when the limiter says no, before authentication and without database access", async () => {
    rateLimitAllowed = false;
    const res = await POST(makeRequest(normalLead, { auth: null }));
    expect(res.status).toBe(429);
    expect(eventCreate).not.toHaveBeenCalled();
    expect(checkRateLimit).toHaveBeenCalledWith("acres99Webhook", expect.stringContaining("203.0.113.20"));
  });
});

describe("creating leads", () => {
  it("creates a normal lead from JSON and answers {success,status:created} only", async () => {
    const res = await POST(makeRequest(normalLead));
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ success: true, status: "created" });

    const lead = leadCreate.mock.calls[0][0].data;
    expect(lead).toMatchObject({
      organizationId: "org_default",
      clientName: "Rahul Sharma",
      phone: "919876543210",
      email: "rahul@example.com",
      source: "ACRES_99",
      portalProvider: "NINETY_NINE_ACRES",
      externalLeadId: "99acres:99A-884213",
      externalListingId: "L-5521",
      transactionType: "SALE",
      assetClass: "RESIDENTIAL",
      minBudget: 5000000,
      maxBudget: 8000000,
      preferredBhk: 3,
      preferredLocation: "Janakpuri, Delhi",
    });
  });

  it("creates a lead from application/x-www-form-urlencoded", async () => {
    const form = new URLSearchParams({ customerName: "Form Person", contactNumber: "9811122233", city: "Gurgaon", purpose: "rent", budget: "45000" }).toString();
    const res = await POST(makeRequest(form, { contentType: "application/x-www-form-urlencoded" }));
    expect(await body(res)).toEqual({ success: true, status: "created" });
    expect(leadCreate.mock.calls[0][0].data).toMatchObject({ clientName: "Form Person", phone: "919811122233", transactionType: "RENT", maxBudget: 45000, requirementType: "RENT" });
  });

  it("creates a lead from the minimum payload (just a phone number), flagged for review", async () => {
    const res = await POST(makeRequest({ phone: "9811122233" }));
    expect(await body(res)).toEqual({ success: true, status: "created" });
    expect(leadCreate.mock.calls[0][0].data).toMatchObject({ clientName: "99acres Enquiry", phone: "919811122233", preferredLocation: "Not specified", minBudget: 0, maxBudget: 0 });
    const auditNew = recordAudit.mock.calls.map((c) => c[0].newValues).find((v) => v?.event === "ACRES99_LEAD_RECEIVED");
    expect(auditNew.needsReview).toBe(true);
  });

  it("maps a residential requirement onto the canonical lead fields", async () => {
    await POST(makeRequest({ ...normalLead, bhk: "2 BHK", propertyType: "Builder Floor" }));
    expect(leadCreate.mock.calls[0][0].data).toMatchObject({ assetClass: "RESIDENTIAL", preferredBhk: 2, commercialPropertyType: null });
  });

  it("maps a commercial Shop requirement onto the canonical commercial fields", async () => {
    await POST(makeRequest({ name: "Shop Buyer", phone: "9811122233", propertyCategory: "Commercial", propertyType: "Shop", transactionType: "Rent", city: "Delhi", locality: "Karol Bagh", budget: "1.5 Lac", bhk: "3" }));
    expect(leadCreate.mock.calls[0][0].data).toMatchObject({ assetClass: "COMMERCIAL", commercialPropertyType: "SHOP", preferredBhk: null, transactionType: "RENT", maxBudget: 150000 });
  });

  it("accepts an unknown additional field, preserving it in the stored payload", async () => {
    const res = await POST(makeRequest({ ...normalLead, brandNewField: "keep me", nested: { deep: 1 } }));
    expect(await body(res)).toEqual({ success: true, status: "created" });
    const snapshot = JSON.parse(eventCreate.mock.calls[0][0].data.leadSnapshot);
    expect(snapshot.rawPayload).toMatchObject({ brandNewField: "keep me", nested: { deep: 1 } });
    expect(snapshot.unmappedFields).toEqual(expect.arrayContaining(["brandNewField", "nested"]));
  });

  it("makes the lead available to the normal CRM workflows (assignment, score, matching, notification)", async () => {
    await POST(makeRequest(normalLead));
    expect(autoAssignLead).toHaveBeenCalledWith("lead_1", "org_default");
    expect(recalculateLeadScore).toHaveBeenCalledWith("lead_1", "LEAD_CREATED");
    expect(runMatchingForLead).toHaveBeenCalledWith("lead_1", "created");
    expect(notifyRoles).toHaveBeenCalledWith(["ADMIN", "DATA_MANAGER"], expect.objectContaining({ leadId: "lead_1", type: "NEW_LEAD" }));
  });

  it("still acknowledges the delivery if a follow-up workflow step throws", async () => {
    runMatchingForLead.mockRejectedValue(new Error("matching down"));
    const res = await POST(makeRequest(normalLead));
    expect(await body(res)).toEqual({ success: true, status: "created" });
  });
});

describe("idempotency", () => {
  it("answers duplicate and creates nothing when the external lead id was already ingested (replay)", async () => {
    eventFindUnique.mockResolvedValue({ id: "evt_old" });
    const res = await POST(makeRequest(normalLead));
    expect(await body(res)).toEqual({ success: true, status: "duplicate" });
    expect(eventFindUnique.mock.calls[0][0].where.organizationId_provider_externalEventId).toEqual({ organizationId: "org_default", provider: "NINETY_NINE_ACRES", externalEventId: "99acres:99A-884213" });
    expect(eventCreate).not.toHaveBeenCalled();
    expect(leadCreate).not.toHaveBeenCalled();
  });

  it("derives a stable fingerprint when no external id is sent, so an identical retry is a duplicate", async () => {
    const payload = { name: "No Id", phone: "9811122233", listingId: "L-1", message: "hello", createdAt: "2026-10-01T10:00:00Z" };
    await POST(makeRequest(payload));
    const firstId = eventFindUnique.mock.calls[0][0].where.organizationId_provider_externalEventId.externalEventId as string;
    expect(firstId).toMatch(/^99acres:fp:[0-9a-f]{64}$/);
    await POST(makeRequest({ ...payload }));
    expect(eventFindUnique.mock.calls[1][0].where.organizationId_provider_externalEventId.externalEventId).toBe(firstId);
    const other = await POST(makeRequest({ ...payload, listingId: "L-2" }));
    expect(other.status).toBe(200);
    expect(eventFindUnique.mock.calls[2][0].where.organizationId_provider_externalEventId.externalEventId).not.toBe(firstId);
  });

  it("answers duplicate (never 5xx) when two concurrent retries race on the unique key", async () => {
    eventCreate.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));
    const res = await POST(makeRequest(normalLead));
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ success: true, status: "duplicate" });
  });

  it("answers duplicate and does not create a second lead when the same person is already a lead", async () => {
    leadFindMany.mockResolvedValue([{ id: "lead_existing", clientName: "Rahul" }]);
    const res = await POST(makeRequest(normalLead));
    expect(await body(res)).toEqual({ success: true, status: "duplicate" });
    expect(leadCreate).not.toHaveBeenCalled();
  });

  it("answers received (needs staff review) when the phone matches several existing leads", async () => {
    leadFindMany.mockResolvedValue([{ id: "a", clientName: "A" }, { id: "b", clientName: "B" }]);
    const res = await POST(makeRequest(normalLead));
    expect(await body(res)).toEqual({ success: true, status: "received" });
    expect(leadCreate).not.toHaveBeenCalled();
  });
});

describe("received but not mappable", () => {
  it("captures the event and answers received when there is no contact information, creating no lead", async () => {
    const res = await POST(makeRequest({ name: "Ghost", message: "no phone given", futureField: 1 }));
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ success: true, status: "received" });
    expect(leadCreate).not.toHaveBeenCalled();
    expect(autoAssignLead).not.toHaveBeenCalled();
    const data = eventCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({ organizationId: "org_default", provider: "NINETY_NINE_ACRES", ingestionStatus: "NEEDS_REVIEW", failureReason: "missing_phone" });
    expect(JSON.parse(data.leadSnapshot).rawPayload).toMatchObject({ name: "Ghost", futureField: 1 });
  });

  it("treats an unusable phone number the same way and keeps the raw value for staff", async () => {
    const res = await POST(makeRequest({ name: "Bad", phone: "12345" }));
    expect(await body(res)).toEqual({ success: true, status: "received" });
    expect(eventCreate.mock.calls[0][0].data.failureReason).toBe("invalid_phone");
    expect(leadCreate).not.toHaveBeenCalled();
  });

  it("is idempotent for an unmapped replay", async () => {
    eventFindUnique.mockResolvedValue({ id: "evt_old" });
    const res = await POST(makeRequest({ name: "Ghost" }));
    expect(await body(res)).toEqual({ success: true, status: "received" });
    expect(eventCreate).not.toHaveBeenCalled();
  });
});

describe("malformed requests", () => {
  it("400s on invalid JSON", async () => {
    const res = await POST(makeRequest(null, { rawBody: "{not json" }));
    expect(res.status).toBe(400);
    expect(await body(res)).toEqual({ success: false, error: "invalid_payload" });
  });

  it.each([["array", "[1,2]"], ["scalar", "42"], ["empty", ""]])("400s on a %s body", async (_n, raw) => {
    const res = await POST(makeRequest(null, { rawBody: raw }));
    expect(res.status).toBe(400);
  });

  it("415s on an unsupported media type", async () => {
    const res = await POST(makeRequest("<x/>", { contentType: "application/xml" }));
    expect(res.status).toBe(415);
  });

  it("413s on an oversized body, whether or not Content-Length is honest", async () => {
    const big = JSON.stringify({ phone: "9811122233", blob: "x".repeat(70 * 1024) });
    const res = await POST(makeRequest(null, { rawBody: big }));
    expect(res.status).toBe(413);
    const liar = await POST(makeRequest(null, { rawBody: big, headers: { "content-length": "10" } }));
    expect(liar.status).toBe(413);
    expect(eventCreate).not.toHaveBeenCalled();
  });
});

describe("tenant isolation", () => {
  it("ignores any organization id in the payload and uses the configured tenant", async () => {
    await POST(makeRequest({ ...normalLead, organizationId: "org_other", organization_id: "org_other", orgId: "org_other", tenant: "org_other" }));
    expect(eventCreate.mock.calls[0][0].data.organizationId).toBe("org_default");
    expect(leadCreate.mock.calls[0][0].data.organizationId).toBe("org_default");
    expect(leadFindMany.mock.calls[0][0].where.organizationId).toBe("org_default");
  });

  it("uses the server-side configured organization when one is set", async () => {
    process.env.ACRES_99_ORGANIZATION_ID = "org_kp";
    await POST(makeRequest({ ...normalLead, organizationId: "org_other" }));
    expect(leadCreate.mock.calls[0][0].data.organizationId).toBe("org_kp");
    expect(eventCreate.mock.calls[0][0].data.organizationId).toBe("org_kp");
  });
});

describe("side effects and secrets", () => {
  it("makes no outbound network call (no WhatsApp or any customer contact)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await POST(makeRequest(normalLead));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("preserves the sanitised raw payload on the external event", async () => {
    await POST(makeRequest(normalLead));
    const data = eventCreate.mock.calls[0][0].data;
    const snapshot = JSON.parse(data.leadSnapshot);
    expect(snapshot.rawPayload).toEqual(normalLead);
    expect(snapshot.receivedFormat).toBe("json");
    expect(data.rawPayloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(data.externalEventId).toBe("99acres:99A-884213");
  });

  it("never stores the webhook secret, the Authorization header or credential-like body fields", async () => {
    await POST(makeRequest({ ...normalLead, api_key: "sk-live-abc", token: "tok", Authorization: "Bearer zzz", cookie: "sid=1", comments: `echo ${SECRET}` }, { headers: { cookie: "session=abc" } }));
    const stored = JSON.stringify([eventCreate.mock.calls, leadCreate.mock.calls, recordAudit.mock.calls]);
    for (const leaked of [SECRET, "sk-live-abc", "Bearer zzz", "sid=1", "session=abc"]) expect(stored).not.toContain(leaked);
    const snapshot = JSON.parse(eventCreate.mock.calls[0][0].data.leadSnapshot);
    expect(snapshot.rawPayload).toMatchObject({ api_key: "[REDACTED]", token: "[REDACTED]", Authorization: "[REDACTED]", cookie: "[REDACTED]" });
  });

  it("never logs the secret, on success or failure", async () => {
    eventCreate.mockRejectedValueOnce(new Error("db down"));
    const res = await POST(makeRequest(normalLead));
    expect(res.status).toBe(500);
    expect(await body(res)).toEqual({ success: false, error: "internal_error" });
    await POST(makeRequest(normalLead, { auth: "Bearer wrong-value" }));
    const logged = JSON.stringify([logger.info.mock.calls, logger.warn.mock.calls, logger.error.mock.calls]);
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain("wrong-value");
  });

  it("never exposes internal ids, stack traces or error detail in a response", async () => {
    const ok = JSON.stringify(await body(await POST(makeRequest(normalLead))));
    expect(ok).not.toMatch(/lead_1|evt_1|org_default/);
    eventCreate.mockRejectedValueOnce(new Error("secret db detail at /srv/app.ts:12"));
    const err = JSON.stringify(await body(await POST(makeRequest(normalLead))));
    expect(err).not.toMatch(/secret db detail|\.ts|stack/);
  });
});
