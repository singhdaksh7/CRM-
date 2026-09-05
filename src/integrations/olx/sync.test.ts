import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * OLX polling/cursor behaviour: first sync, incremental sync with overlap,
 * 7-day window chunking, restart-safe (DB-only) cursor, and partial
 * pagination failure not losing already-ingested leads.
 */

const connectionUpdate = vi.fn();
const connectionFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    propertyPortalConnection: {
      update: (...a: unknown[]) => connectionUpdate(...a),
      findMany: (...a: unknown[]) => connectionFindMany(...a),
    },
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const ingestPortalLead = vi.fn();
vi.mock("@/integrations/property-portals/ingestion", () => ({ ingestPortalLead: (...a: unknown[]) => ingestPortalLead(...a) }));

const fetchLeadsPage = vi.fn();
vi.mock("./client", async () => {
  const actual = await vi.importActual<typeof import("./client")>("./client");
  return { ...actual, fetchLeadsPage: (...a: unknown[]) => fetchLeadsPage(...a) };
});

const { computeSyncWindows, computeSyncStart, syncOlxConnection, runOlxSync } = await import("./sync");
const { OlxApiError } = await import("./client");

// Per the documented contract, leads carry no embedded `ad` field - the
// correlated ad (if any) is supplied separately as an `ads` Map on the
// fetchLeadsPage() result, keyed by adId (see client.ts).
function olxLead(adId: string) {
  return { name: "Test Lead", phoneNumber: "9811100001", emailId: null, date: "01/03/26", adId };
}

function olxAdsMap(entries: Array<{ id: string; title?: string | null; price?: number | null; parameters?: Record<string, unknown> | null }>) {
  return new Map(entries.map((e) => [e.id, { id: e.id, title: e.title ?? null, desc: null, price: e.price ?? null, lat: null, long: null, parameters: e.parameters ?? null }]));
}

beforeEach(() => {
  vi.clearAllMocks();
  connectionUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "conn1", ...data }));
  ingestPortalLead.mockResolvedValue({ status: "NEW", lead: { id: "lead1" }, event: { id: "evt1" } });
});

describe("computeSyncWindows", () => {
  it("chunks a long range into <=7-day segments", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2026-01-20T00:00:00Z");
    const windows = computeSyncWindows(from, to);
    expect(windows.length).toBe(3);
    for (const w of windows) {
      expect(w.endDate.getTime() - w.startDate.getTime()).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000);
    }
    expect(windows[0].startDate.getTime()).toBe(from.getTime());
    expect(windows[windows.length - 1].endDate.getTime()).toBe(to.getTime());
  });

  it("returns no windows when from >= to", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(computeSyncWindows(now, now)).toEqual([]);
  });

  it("returns a single window for a short range", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2026-01-02T00:00:00Z");
    expect(computeSyncWindows(from, to)).toHaveLength(1);
  });
});

describe("computeSyncStart", () => {
  it("uses a bounded lookback on first sync (no cursor)", () => {
    const now = new Date("2026-01-10T00:00:00Z");
    const start = computeSyncStart(null, now);
    expect(start.getTime()).toBeLessThan(now.getTime());
    expect(now.getTime() - start.getTime()).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000);
  });

  it("subtracts an overlap window from the existing cursor on incremental sync", () => {
    const now = new Date("2026-01-10T00:00:00Z");
    const cursor = new Date("2026-01-09T12:00:00Z");
    const start = computeSyncStart(cursor, now);
    expect(start.getTime()).toBeLessThan(cursor.getTime());
  });
});

describe("syncOlxConnection", () => {
  const connection = { id: "conn1", organizationId: "org_default", lastSuccessfulSyncAt: new Date("2026-01-09T00:00:00Z") };
  const now = new Date("2026-01-10T00:00:00Z");

  it("ingests every lead in a single-window, single-page sync and advances the cursor to now", async () => {
    fetchLeadsPage.mockResolvedValueOnce({ leads: [olxLead("ad-1")], ads: new Map(), rejected: 0, page: 1, pageSize: 100, isLastPage: true });
    const result = await syncOlxConnection(connection, now);
    expect(result.leadsNew).toBe(1);
    expect(result.error).toBeNull();
    const finalUpdate = connectionUpdate.mock.calls.at(-1)?.[0];
    expect(finalUpdate.data.lastSuccessfulSyncAt).toEqual(now);
    expect(finalUpdate.data.status).toBe("CONNECTED");
  });

  it("scopes ingestion to the connection's own organizationId, never anything from the OLX response", async () => {
    fetchLeadsPage.mockResolvedValueOnce({ leads: [olxLead("ad-1")], ads: new Map(), rejected: 0, page: 1, pageSize: 100, isLastPage: true });
    await syncOlxConnection(connection, now);
    expect(ingestPortalLead.mock.calls[0][0]).toBe("org_default");
    expect(ingestPortalLead.mock.calls[0][1]).toBe("OLX");
    expect(ingestPortalLead.mock.calls[0][4]).toMatchObject({ connectionId: "conn1" });
  });

  it("does not activate Sell.Do while processing a genuinely new OLX lead", async () => {
    fetchLeadsPage.mockResolvedValueOnce({ leads: [olxLead("ad-1")], ads: new Map(), rejected: 0, page: 1, pageSize: 100, isLastPage: true });
    ingestPortalLead.mockResolvedValueOnce({ status: "DUPLICATE", event: { id: "evt1" } });
    const result = await syncOlxConnection(connection, now);
    expect(result.leadsNew).toBe(0);
  });

  it("does not lose leads already ingested from earlier pages when a later page fails (partial pagination failure)", async () => {
    fetchLeadsPage
      .mockResolvedValueOnce({ leads: [olxLead("ad-1")], ads: new Map(), rejected: 0, page: 1, pageSize: 1, isLastPage: false })
      .mockRejectedValueOnce(new OlxApiError(500, "upstream error on page 2"));
    const result = await syncOlxConnection(connection, now);
    expect(ingestPortalLead).toHaveBeenCalledTimes(1); // page 1's lead was ingested before page 2 failed
    expect(result.error).toContain("upstream error");
    const finalUpdate = connectionUpdate.mock.calls.at(-1)?.[0];
    // Cursor is not advanced to `now` on failure - the failed window is retried next run.
    expect(finalUpdate.data.lastSuccessfulSyncAt).toBeUndefined();
    expect(finalUpdate.data.status).toBe("DEGRADED");
  });

  it("marks the connection AUTH_FAILED (not DEGRADED) on an auth failure", async () => {
    const { OlxAuthError } = await import("./client");
    fetchLeadsPage.mockRejectedValueOnce(new OlxAuthError("credentials rejected"));
    const result = await syncOlxConnection(connection, now);
    expect(result.error).toContain("credentials rejected");
    const finalUpdate = connectionUpdate.mock.calls.at(-1)?.[0];
    expect(finalUpdate.data.status).toBe("AUTH_FAILED");
  });

  it("one malformed/failing lead never aborts the rest of the page", async () => {
    fetchLeadsPage.mockResolvedValueOnce({ leads: [olxLead("ad-1"), olxLead("ad-2")], ads: new Map(), rejected: 0, page: 1, pageSize: 100, isLastPage: true });
    ingestPortalLead.mockRejectedValueOnce(new Error("db down")).mockResolvedValueOnce({ status: "NEW", lead: { id: "lead2" }, event: { id: "evt2" } });
    const result = await syncOlxConnection(connection, now);
    expect(ingestPortalLead).toHaveBeenCalledTimes(2);
    expect(result.leadsNew).toBe(1);
  });

  it("is a no-op when the computed window is empty (e.g. clock skew puts the cursor at/after now)", async () => {
    const future = new Date(now.getTime() + 60 * 60 * 1000);
    const result = await syncOlxConnection({ id: "conn1", organizationId: "org_default", lastSuccessfulSyncAt: future }, now);
    expect(fetchLeadsPage).not.toHaveBeenCalled();
    expect(result.windowsPlanned).toBe(0);
  });

  describe("adId <-> ads-array correlation (documented as two separate lists, not an embedded field)", () => {
    it("enriches a lead using its correlated ad from the page's separate ads map", async () => {
      fetchLeadsPage.mockResolvedValueOnce({
        leads: [olxLead("ad-1")],
        ads: olxAdsMap([{ id: "ad-1", title: "2BHK Flat", price: 30000, parameters: { locality: "Dwarka", adType: "Rent" } }]),
        rejected: 0,
        page: 1,
        pageSize: 100,
        isLastPage: true,
      });
      await syncOlxConnection(connection, now);
      const canonical = ingestPortalLead.mock.calls[0][2];
      expect(canonical.locality).toBe("Dwarka");
      expect(canonical.transactionType).toBe("RENT");
      expect(canonical.minBudget).toBe(30000);
    });

    it("still ingests a lead whose adId has no correlated entry in the ads map", async () => {
      fetchLeadsPage.mockResolvedValueOnce({ leads: [olxLead("ad-orphan")], ads: new Map(), rejected: 0, page: 1, pageSize: 100, isLastPage: true });
      const result = await syncOlxConnection(connection, now);
      expect(result.leadsNew).toBe(1);
      const canonical = ingestPortalLead.mock.calls[0][2];
      expect(canonical.name).toBe("Test Lead");
      expect(canonical.locality).toBe("Unknown (OLX)");
    });

    it("handled gracefully when the page returns an ads map with no matching adId at all", async () => {
      fetchLeadsPage.mockResolvedValueOnce({
        leads: [olxLead("ad-1")],
        ads: olxAdsMap([{ id: "ad-unrelated", title: "Some other ad" }]),
        rejected: 0,
        page: 1,
        pageSize: 100,
        isLastPage: true,
      });
      const result = await syncOlxConnection(connection, now);
      expect(result.leadsNew).toBe(1);
      expect(result.error).toBeNull();
    });

    it("preserves both the raw lead and its correlated ad (or null) in the rawPayload passed to ingestPortalLead", async () => {
      fetchLeadsPage.mockResolvedValueOnce({
        leads: [olxLead("ad-1")],
        ads: olxAdsMap([{ id: "ad-1", title: "2BHK Flat" }]),
        rejected: 0,
        page: 1,
        pageSize: 100,
        isLastPage: true,
      });
      await syncOlxConnection(connection, now);
      const rawPayload = ingestPortalLead.mock.calls[0][3];
      expect(rawPayload.lead.adId).toBe("ad-1");
      expect(rawPayload.ad.title).toBe("2BHK Flat");
    });
  });
});

describe("runOlxSync tenant scope", () => {
  it("looks up only the requested organization's OLX connections", async () => {
    process.env.OLX_DEALER_LOGIN = "test-dealer";
    process.env.OLX_DEALER_PASSWORD = "test-password";
    process.env.OLX_LIVE_INGESTION_ENABLED = "true";
    connectionFindMany.mockResolvedValue([]);

    await runOlxSync({ organizationId: "org_a" });

    expect(connectionFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organizationId: "org_a", provider: "OLX" }),
    }));
  });

  it("fails closed before any connection lookup until live ingestion is explicitly enabled", async () => {
    process.env.OLX_DEALER_LOGIN = "test-dealer";
    process.env.OLX_DEALER_PASSWORD = "test-password";
    delete process.env.OLX_LIVE_INGESTION_ENABLED;

    await runOlxSync({ organizationId: "org_a" });

    expect(connectionFindMany).not.toHaveBeenCalled();
  });
});
