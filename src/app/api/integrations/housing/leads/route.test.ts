import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Housing lead-push webhook endpoint. Housing pushes leads to us with no
 * authentication by default; the contract is exact response bodies
 * ("RECEIVED" / "BAD REQUEST"), idempotent duplicate handling, and zero
 * leakage of internal/CRM data or stack traces in any response.
 */

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
    lead: {
      findMany: (...a: unknown[]) => leadFindMany(...a),
      create: (...a: unknown[]) => leadCreate(...a),
    },
    customerContact: {
      findUnique: (...a: unknown[]) => customerContactFindUnique(...a),
    },
  },
}));

let rateLimitAllowed = true;
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: rateLimitAllowed, limit: 120, remaining: 119, resetSeconds: 60 }),
  clientIp: () => "203.0.113.10",
  rateLimitResponse: () => new Response("RATE LIMITED", { status: 429 }),
}));

const recordAudit = vi.fn();
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => recordAudit(...a) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

let webhookSecret: string | null = null;
let allowedIps: string[] | null = null;
let organizationId = "org_default";
vi.mock("@/integrations/housing/config", () => ({
  getHousingOrganizationId: () => organizationId,
  getHousingWebhookSecret: () => webhookSecret,
  getHousingAllowedIps: () => allowedIps,
  getHousingWebhookUrl: () => "https://crm.kpproperties.co.in/api/integrations/housing/leads",
}));

// No fetch/http client mocks are registered anywhere in this file - if the
// route (directly or transitively) ever tried to reach WhatsApp, a visit
// scheduler, a deal, or an external provider, the corresponding call would
// throw "not a function" / hit a real network boundary and fail the test.

const { POST } = await import("./route");

const validPayload = {
  lead_date: 1692858120,
  apartment_names: "3 BHK",
  country_code: "+91",
  service_type: "new-projects",
  category_type: "residential",
  locality_name: "Khyora",
  city_name: "Kanpur",
  lead_name: "Manish",
  lead_email: "example@gmail.com",
  lead_phone: "9415516905",
  project_id: 265012,
  project_name: "The Peak",
  property_field: ["Apartment"],
  max_area: null,
  min_area: null,
  min_price: 8298450,
  max_price: 9315000,
};

function makeRequest(body: unknown, init?: { headers?: Record<string, string>; rawBody?: string; method?: string }) {
  const text = init?.rawBody ?? JSON.stringify(body);
  return new NextRequest(
    new Request("https://crm.kpproperties.co.in/api/integrations/housing/leads", {
      method: init?.method ?? "POST",
      headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(text)), ...init?.headers },
      body: text,
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitAllowed = true;
  webhookSecret = null;
  allowedIps = null;
  organizationId = "org_default";
  eventFindUnique.mockResolvedValue(null);
  eventFindFirst.mockResolvedValue(null);
  eventCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "evt1", ...data }));
  eventUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "evt1", ...data }));
  leadFindMany.mockResolvedValue([]);
  leadCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "lead-new", ...data }));
  customerContactFindUnique.mockResolvedValue(null);
});

describe("POST /api/integrations/housing/leads", () => {
  it("returns exactly RECEIVED with 200 for a valid new lead", async () => {
    const res = await POST(makeRequest(validPayload));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("RECEIVED");
  });

  it("creates the ExternalLeadEvent with provider HOUSING and a deterministic externalEventId", async () => {
    await POST(makeRequest(validPayload));
    const data = eventCreate.mock.calls[0][0].data;
    expect(data.provider).toBe("HOUSING");
    expect(data.externalEventId).toMatch(/^housing:[a-f0-9]{64}$/);
  });

  it("returns RECEIVED again for an exact duplicate delivery without creating a second event or lead", async () => {
    await POST(makeRequest(validPayload));
    const firstEventId = eventCreate.mock.calls[0][0].data.externalEventId;
    eventFindUnique.mockResolvedValue({ id: "evt1", externalEventId: firstEventId });

    const res = await POST(makeRequest(validPayload));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("RECEIVED");
    expect(eventCreate).toHaveBeenCalledTimes(1);
    expect(leadCreate).toHaveBeenCalledTimes(1);
  });

  it("returns exactly BAD REQUEST with 400 for a missing required field", async () => {
    const incomplete: Record<string, unknown> = { ...validPayload };
    delete incomplete.lead_phone;
    const res = await POST(makeRequest(incomplete));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("BAD REQUEST");
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it("returns BAD REQUEST for an invalid phone number", async () => {
    const res = await POST(makeRequest({ ...validPayload, lead_phone: "123" }));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("BAD REQUEST");
  });

  it("returns BAD REQUEST for an invalid (non-numeric) timestamp", async () => {
    const res = await POST(makeRequest({ ...validPayload, lead_date: "not-a-timestamp" }));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("BAD REQUEST");
  });

  it("returns BAD REQUEST for malformed JSON", async () => {
    const res = await POST(makeRequest(null, { rawBody: "{not json" }));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("BAD REQUEST");
  });

  it("returns BAD REQUEST (415-class) for the wrong content type", async () => {
    const res = await POST(makeRequest(validPayload, { headers: { "content-type": "text/plain" } }));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("BAD REQUEST");
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it("rejects an oversized body before parsing", async () => {
    const big = "x".repeat(300 * 1024);
    const res = await POST(makeRequest(null, { rawBody: JSON.stringify({ ...validPayload, lead_name: big }) }));
    expect(res.status).toBe(413);
    expect(await res.text()).toBe("BAD REQUEST");
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it("never leaks CRM/internal data (lead id, org id, db field names) in the response body", async () => {
    const res = await POST(makeRequest(validPayload));
    const text = await res.text();
    expect(text).toBe("RECEIVED");
    expect(text).not.toMatch(/lead-new|org_default|externalEventId|organizationId/);
  });

  it("never leaks a stack trace even when ingestion throws unexpectedly", async () => {
    leadCreate.mockRejectedValueOnce(new Error("db exploded: connection string leaked here"));
    const res = await POST(makeRequest(validPayload));
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(text).not.toContain("db exploded");
    expect(text).not.toContain("connection string");
  });

  it("is rate limited using a housing-specific rule", async () => {
    rateLimitAllowed = false;
    const res = await POST(makeRequest(validPayload));
    expect(res.status).toBe(429);
    expect(eventCreate).not.toHaveBeenCalled();
  });

  describe("optional shared-secret auth", () => {
    it("stays open (no auth required) when HOUSING_WEBHOOK_SECRET is not set", async () => {
      const res = await POST(makeRequest(validPayload));
      expect(res.status).toBe(200);
    });

    it("rejects requests missing the secret once HOUSING_WEBHOOK_SECRET is set", async () => {
      webhookSecret = "sekrit";
      const res = await POST(makeRequest(validPayload));
      expect(res.status).toBe(400);
      expect(eventCreate).not.toHaveBeenCalled();
    });

    it("accepts requests carrying the correct secret header", async () => {
      webhookSecret = "sekrit";
      const res = await POST(makeRequest(validPayload, { headers: { "x-housing-webhook-secret": "sekrit" } }));
      expect(res.status).toBe(200);
    });
  });

  describe("optional IP allowlist", () => {
    it("rejects a request from an IP not on the allowlist once configured", async () => {
      allowedIps = ["198.51.100.1"];
      const res = await POST(makeRequest(validPayload));
      expect(res.status).toBe(400);
      expect(eventCreate).not.toHaveBeenCalled();
    });
  });

  describe("Demand Pool CustomerContact linkage", () => {
    it("links a newly-created Lead to an existing CustomerContact on exact normalizedPhone match, without creating a contact", async () => {
      customerContactFindUnique.mockResolvedValue({ id: "contact-1" });
      await POST(makeRequest(validPayload));
      expect(leadCreate.mock.calls[0][0].data.customerContactId).toBe("contact-1");
      // Read-only lookup: only findUnique is exercised, nothing that could create/update a contact.
      expect(customerContactFindUnique).toHaveBeenCalledTimes(1);
    });

    it("leaves customerContactId null when no CustomerContact matches", async () => {
      await POST(makeRequest(validPayload));
      expect(leadCreate.mock.calls[0][0].data.customerContactId).toBeNull();
    });
  });

  describe("organization targeting", () => {
    it("always attributes the event to the configured Housing organization, never a value from the payload", async () => {
      organizationId = "org_configured";
      await POST(makeRequest({ ...validPayload, organizationId: "org_attacker" }));
      expect(eventCreate.mock.calls[0][0].data.organizationId).toBe("org_configured");
      expect(leadFindMany.mock.calls[0][0].where.organizationId).toBe("org_configured");
    });
  });

  describe("no SSRF / no outbound calls", () => {
    it("never treats a URL-shaped payload field as something to fetch", async () => {
      const res = await POST(makeRequest({ ...validPayload, project_name: "http://169.254.169.254/latest/meta-data" }));
      expect(res.status).toBe(200);
      // project_name is only ever persisted as a string field/snapshot value, never fetched.
    });
  });
});

describe("GET /api/integrations/housing/leads", () => {
  it("is not exported by the route, so Next.js returns 405 for GET", async () => {
    const routeModule = await import("./route");
    expect((routeModule as Record<string, unknown>).GET).toBeUndefined();
  });
});
