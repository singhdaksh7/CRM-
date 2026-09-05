import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * OLX Dealer API client - auth (success/failure/caching/expiry/403 reauth
 * retry-once), pagination (single page, multi-page, max page size boundary).
 * No real OLX credentials exist in this environment: every case here mocks
 * global fetch and never makes a network call.
 */

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  vi.resetModules();
  process.env.OLX_DEALER_LOGIN = "dealer@kpproperties.example";
  process.env.OLX_DEALER_PASSWORD = "secret-password-value";
  process.env.OLX_API_BASE_URL = "https://olx.example.test";
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("OLX authentication", () => {
  it("logs in and caches the token/userId within one process", async () => {
    const { fetchLeadsPage, _resetOlxTokenCacheForTests } = await import("./client");
    _resetOlxTokenCacheForTests();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "tok-1", refresh_token: "refresh-1", user_id: "user-9" }))
      .mockResolvedValueOnce(jsonResponse({ leads: [] }))
      .mockResolvedValueOnce(jsonResponse({ leads: [] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchLeadsPage({ startDate: "2026-01-01", endDate: "2026-01-02" });
    await fetchLeadsPage({ startDate: "2026-01-01", endDate: "2026-01-02" });

    // Only one login call across two lead-fetch calls: the token was cached.
    const loginCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/auth/login"));
    expect(loginCalls).toHaveLength(1);
  });

  it("fails without throwing a network call when credentials are not configured", async () => {
    delete process.env.OLX_DEALER_LOGIN;
    delete process.env.OLX_DEALER_PASSWORD;
    const { fetchLeadsPage, _resetOlxTokenCacheForTests, OlxAuthError } = await import("./client");
    _resetOlxTokenCacheForTests();
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    await expect(fetchLeadsPage({ startDate: "2026-01-01", endDate: "2026-01-02" })).rejects.toBeInstanceOf(OlxAuthError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws OlxAuthError when login itself returns a non-2xx status", async () => {
    const { fetchLeadsPage, _resetOlxTokenCacheForTests, OlxAuthError } = await import("./client");
    _resetOlxTokenCacheForTests();
    global.fetch = vi.fn().mockResolvedValue(new Response("bad creds", { status: 401 })) as unknown as typeof fetch;
    await expect(fetchLeadsPage({ startDate: "2026-01-01", endDate: "2026-01-02" })).rejects.toBeInstanceOf(OlxAuthError);
  });

  it("re-authenticates exactly once on a 403 and retries the original request exactly once, never looping", async () => {
    const { fetchLeadsPage, _resetOlxTokenCacheForTests } = await import("./client");
    _resetOlxTokenCacheForTests();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "tok-old", user_id: "user-1" })) // initial login
      .mockResolvedValueOnce(new Response("expired", { status: 403 })) // first attempt: expired token
      .mockResolvedValueOnce(jsonResponse({ access_token: "tok-new", user_id: "user-1" })) // re-auth
      .mockResolvedValueOnce(jsonResponse({ leads: [] })); // retried request succeeds
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchLeadsPage({ startDate: "2026-01-01", endDate: "2026-01-02" });
    expect(result.leads).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("surfaces a failure (never an infinite loop) when the retried request is also 403", async () => {
    const { fetchLeadsPage, _resetOlxTokenCacheForTests, OlxApiError } = await import("./client");
    _resetOlxTokenCacheForTests();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "tok-old", user_id: "user-1" }))
      .mockResolvedValueOnce(new Response("expired", { status: 403 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "tok-new", user_id: "user-1" }))
      .mockResolvedValueOnce(new Response("still expired", { status: 403 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(fetchLeadsPage({ startDate: "2026-01-01", endDate: "2026-01-02" })).rejects.toBeInstanceOf(OlxApiError);
    // Exactly 4 calls total (1 login + 1 attempt + 1 re-login + 1 retry) - no third attempt.
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe("OLX leads pagination", () => {
  it("returns a single page when fewer leads than pageSize come back", async () => {
    const { fetchLeadsPage, _resetOlxTokenCacheForTests } = await import("./client");
    _resetOlxTokenCacheForTests();
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "tok", user_id: "u1" }))
      .mockResolvedValueOnce(jsonResponse({ leads: [{ name: "A", phoneNumber: "9811100001", emailId: null, date: "01/03/26", adId: "ad-1" }] })) as unknown as typeof fetch;
    const page = await fetchLeadsPage({ startDate: "2026-01-01", endDate: "2026-01-02", pageSize: 100 });
    expect(page.isLastPage).toBe(true);
    expect(page.leads).toHaveLength(1);
  });

  it("paginates across multiple pages via fetchAllLeadsForWindow, stopping at the first short page", async () => {
    const { fetchAllLeadsForWindow, _resetOlxTokenCacheForTests } = await import("./client");
    _resetOlxTokenCacheForTests();
    const leadFactory = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => ({ name: `Lead ${i}`, phoneNumber: "9811100001", emailId: null, date: "01/03/26", adId: `${prefix}-${i}` }));
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "tok", user_id: "u1" }))
      .mockResolvedValueOnce(jsonResponse({ leads: leadFactory(100, "p1") })) // full page (OLX max pageSize=100) -> more to come
      .mockResolvedValueOnce(jsonResponse({ leads: leadFactory(1, "p2") })) as unknown as typeof fetch; // short page -> last

    const result = await fetchAllLeadsForWindow("2026-01-01", "2026-01-02");
    expect(result.pagesFetched).toBe(2);
    expect(result.leads).toHaveLength(101);
  });

  it("caps pageSize at the documented OLX maximum of 100 even if a larger value is requested", async () => {
    const { fetchLeadsPage, _resetOlxTokenCacheForTests } = await import("./client");
    _resetOlxTokenCacheForTests();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "tok", user_id: "u1" }))
      .mockResolvedValueOnce(jsonResponse({ leads: [] }));
    global.fetch = fetchMock as unknown as typeof fetch;
    await fetchLeadsPage({ startDate: "2026-01-01", endDate: "2026-01-02", pageSize: 500 });
    const leadsCallUrl = String(fetchMock.mock.calls[1][0]);
    expect(new URL(leadsCallUrl).searchParams.get("pageSize")).toBe("100");
  });

  it("treats a documented 404/no-leads response as a valid empty page", async () => {
    const { fetchLeadsPage, _resetOlxTokenCacheForTests } = await import("./client");
    _resetOlxTokenCacheForTests();
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "tok", user_id: "u1" }))
      .mockResolvedValueOnce(new Response(null, { status: 404 })) as unknown as typeof fetch;
    await expect(fetchLeadsPage({ startDate: "2026-01-01", endDate: "2026-01-02" })).resolves.toMatchObject({ leads: [], isLastPage: true });
  });

  it("rejects a malformed lead without discarding the rest of the page", async () => {
    const { fetchLeadsPage, _resetOlxTokenCacheForTests } = await import("./client");
    _resetOlxTokenCacheForTests();
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "tok", user_id: "u1" }))
      .mockResolvedValueOnce(jsonResponse({ leads: [
        { name: "Good Lead", phoneNumber: "9811100001", emailId: null, date: "01/03/26", adId: "ad-1" },
        { name: "", phoneNumber: "x", date: "not-a-date", adId: "ad-2" }, // malformed
      ] })) as unknown as typeof fetch;
    const page = await fetchLeadsPage({ startDate: "2026-01-01", endDate: "2026-01-02" });
    expect(page.leads).toHaveLength(1);
    expect(page.rejected).toBe(1);
  });
});

describe("OLX leads/ads correlation (documented as two separate lists)", () => {
  it("parses leads and ads as separate arrays and exposes an adId -> ad lookup map", async () => {
    const { fetchLeadsPage, _resetOlxTokenCacheForTests } = await import("./client");
    _resetOlxTokenCacheForTests();
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "tok", user_id: "u1" }))
      .mockResolvedValueOnce(jsonResponse({
        leads: [{ name: "A", phoneNumber: "9811100001", emailId: null, date: "01/03/26", adId: "ad-1" }],
        ads: [{ id: "ad-1", title: "2BHK Flat", desc: "Nice", price: 40000, lat: 28.1, long: 77.2, parameters: { locality: "Dwarka" } }],
      })) as unknown as typeof fetch;

    const page = await fetchLeadsPage({ startDate: "2026-01-01", endDate: "2026-01-02" });
    expect(page.leads).toHaveLength(1);
    expect(page.ads.get("ad-1")?.title).toBe("2BHK Flat");
  });

  it("leaves the ads map without an entry when a lead's adId has no correlated ad - never rejects the lead", async () => {
    const { fetchLeadsPage, _resetOlxTokenCacheForTests } = await import("./client");
    _resetOlxTokenCacheForTests();
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "tok", user_id: "u1" }))
      .mockResolvedValueOnce(jsonResponse({
        leads: [{ name: "A", phoneNumber: "9811100001", emailId: null, date: "01/03/26", adId: "ad-orphan" }],
        ads: [{ id: "ad-other", title: "Different ad", price: 10000 }],
      })) as unknown as typeof fetch;

    const page = await fetchLeadsPage({ startDate: "2026-01-01", endDate: "2026-01-02" });
    expect(page.leads).toHaveLength(1);
    expect(page.ads.has("ad-orphan")).toBe(false);
  });

  it("tolerates a response with no ads array at all", async () => {
    const { fetchLeadsPage, _resetOlxTokenCacheForTests } = await import("./client");
    _resetOlxTokenCacheForTests();
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "tok", user_id: "u1" }))
      .mockResolvedValueOnce(jsonResponse({ leads: [{ name: "A", phoneNumber: "9811100001", emailId: null, date: "01/03/26", adId: "ad-1" }] })) as unknown as typeof fetch;

    const page = await fetchLeadsPage({ startDate: "2026-01-01", endDate: "2026-01-02" });
    expect(page.leads).toHaveLength(1);
    expect(page.ads.size).toBe(0);
  });

  it("merges the ads map across pages in fetchAllLeadsForWindow", async () => {
    const { fetchAllLeadsForWindow, _resetOlxTokenCacheForTests } = await import("./client");
    _resetOlxTokenCacheForTests();
    const leadFactory = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => ({ name: `Lead ${i}`, phoneNumber: "9811100001", emailId: null, date: "01/03/26", adId: `${prefix}-${i}` }));
    const adFactory = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}`, title: `Ad ${prefix}-${i}` }));
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "tok", user_id: "u1" }))
      .mockResolvedValueOnce(jsonResponse({ leads: leadFactory(100, "p1"), ads: adFactory(100, "p1") }))
      .mockResolvedValueOnce(jsonResponse({ leads: leadFactory(1, "p2"), ads: adFactory(1, "p2") })) as unknown as typeof fetch;

    const result = await fetchAllLeadsForWindow("2026-01-01", "2026-01-02");
    expect(result.leads).toHaveLength(101);
    expect(result.ads.size).toBe(101);
    expect(result.ads.get("p2-0")?.title).toBe("Ad p2-0");
  });
});
