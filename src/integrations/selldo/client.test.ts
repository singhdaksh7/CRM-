import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Sell.Do client - request shape/encoding correctness (URLSearchParams,
 * never hand-concatenated), SRD inclusion, missing-config graceful
 * handling, API-error and network/timeout handling. No real Sell.Do API
 * key exists in this environment: every case mocks global fetch.
 */

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env.SELLDO_API_KEY = "test-key-not-a-real-secret";
  process.env.SELLDO_SRD = "test-srd-value";
  process.env.SELLDO_API_BASE_URL = "https://selldo.example.test";
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("createSelldoLead", () => {
  it("sends a form-encoded POST with the documented sell_do[...] fields and the SRD", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { createSelldoLead } = await import("./client");

    const outcome = await createSelldoLead({ name: "Ramesh Kumar", email: "ramesh@example.com", phone: "919811100099", note: "Lead received from OLX Dealer API. OLX Ad ID: ad-1. CRM Lead ID: lead-1." });

    expect(outcome.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("secret_key=test-key-not-a-real-secret");
    expect(init.method).toBe("POST");
    expect(init.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("sell_do[form][lead][name]")).toBe("Ramesh Kumar");
    expect(body.get("sell_do[form][lead][email]")).toBe("ramesh@example.com");
    expect(body.get("sell_do[form][lead][phone]")).toBe("919811100099");
    expect(body.get("sell_do[campaign][srd]")).toBe("test-srd-value");
    expect(body.get("sell_do[campaign][name]")).toBe("OLX Lead Generation");
    expect(body.get("sell_do[campaign][source]")).toBe("OLX");
    expect(body.get("sell_do[campaign][sub_source]")).toBe("OLX Dealer API");
    expect(body.get("sell_do[campaign][project]")).toBe("KP Properties");
    expect(body.get("sell_do[form][content][note]")).toContain("CRM Lead ID: lead-1");
  });

  it("never includes GPS/exact-address content in the note field it was given (caller's responsibility, but verify passthrough is literal)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const { createSelldoLead } = await import("./client");
    await createSelldoLead({ name: "A", phone: "919811100099", note: "Lead received from OLX Dealer API. OLX Ad ID: ad-1. CRM Lead ID: lead-1." });
    const [, init] = fetchMock.mock.calls[0];
    const body = new URLSearchParams(init.body as string);
    expect(body.get("sell_do[form][content][note]")).not.toMatch(/\d{1,3}\.\d{4,},/); // no lat,long-shaped coordinate pair
  });

  it("returns NOT_CONFIGURED without calling fetch when SELLDO_API_KEY is missing", async () => {
    delete process.env.SELLDO_API_KEY;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const { createSelldoLead } = await import("./client");
    const outcome = await createSelldoLead({ name: "A", phone: "919811100099", note: "note" });
    expect(outcome).toEqual({ ok: false, reason: "NOT_CONFIGURED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns SRD_NOT_CONFIGURED without calling fetch when SELLDO_SRD is missing, and never crashes", async () => {
    delete process.env.SELLDO_SRD;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const { createSelldoLead } = await import("./client");
    const outcome = await createSelldoLead({ name: "A", phone: "919811100099", note: "note" });
    expect(outcome).toEqual({ ok: false, reason: "SRD_NOT_CONFIGURED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("handles a Sell.Do API error status without throwing", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("server error", { status: 500 })) as unknown as typeof fetch;
    const { createSelldoLead } = await import("./client");
    const outcome = await createSelldoLead({ name: "A", phone: "919811100099", note: "note" });
    expect(outcome).toEqual({ ok: false, reason: "API_ERROR", status: 500 });
  });

  it("handles a network/timeout failure without throwing", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("fetch failed: ECONNREFUSED")) as unknown as typeof fetch;
    const { createSelldoLead } = await import("./client");
    const outcome = await createSelldoLead({ name: "A", phone: "919811100099", note: "note" });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("NETWORK_ERROR");
  });
});
