import "server-only";
import { getOlxApiBaseUrl, getOlxDealerLogin, getOlxDealerPassword, shouldSendOlxDevHeader, OLX_MAX_PAGE_SIZE, OLX_ACCESS_TOKEN_TTL_SECONDS } from "./config";
import { olxLoginResponseSchema, olxLeadsResponseSchema, olxLeadSchema, olxAdSnapshotSchema, type OlxLeadPayload, type OlxAdSnapshot } from "./schema";
import { logger } from "@/lib/logger";

/**
 * OLX Dealer Lead Sharing API client. Server-only, no browser exposure.
 * Token caching is intentionally scoped to a single module-level variable
 * that lives only as long as one serverless invocation - Vercel gives no
 * durable memory between invocations, so re-authenticating once per
 * cron/admin-triggered sync run is expected and correct (see config.ts /
 * the task's TOKEN MANAGEMENT section). Never logs a token or credential.
 */

export class OlxAuthError extends Error {}
export class OlxApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type CachedToken = { accessToken: string; userId: string; expiresAtMs: number };
let cachedToken: CachedToken | null = null;

/** Test-only: force re-authentication on the next call within this process. */
export function _resetOlxTokenCacheForTests() {
  cachedToken = null;
}

function baseHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "client-language": "en-IN" };
  if (shouldSendOlxDevHeader()) headers["x-origin-panamera"] = "dev";
  return headers;
}

async function login(): Promise<CachedToken> {
  const username = getOlxDealerLogin();
  const password = getOlxDealerPassword();
  if (!username || !password) {
    throw new OlxAuthError("OLX credentials are not configured (OLX_DEALER_LOGIN / OLX_DEALER_PASSWORD).");
  }

  const response = await fetch(`${getOlxApiBaseUrl()}/api/v1/auth/login`, {
    method: "POST",
    headers: { ...baseHeaders(), "content-type": "text/plain" },
    // Content-Type is deliberately text/plain per the task's endpoint
    // contract; the body itself is still JSON-encoded (OLX's documented
    // login contract fixes the header, not the payload).
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    // Never include the response body (may echo request fields) in logs.
    logger.error("olx_login_failed", { status: response.status });
    throw new OlxAuthError(`OLX login failed with status ${response.status}`);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new OlxAuthError("OLX login returned a non-JSON response.");
  }
  const parsed = olxLoginResponseSchema.safeParse(json);
  if (!parsed.success) throw new OlxAuthError("OLX login response did not match the documented contract.");

  const token: CachedToken = {
    accessToken: parsed.data.access_token,
    userId: String(parsed.data.user_id),
    // Small safety margin so a token is treated as expired a little before
    // OLX's actual 15-minute cutoff, avoiding a request landing right on
    // the boundary.
    expiresAtMs: Date.now() + (OLX_ACCESS_TOKEN_TTL_SECONDS - 30) * 1000,
  };
  cachedToken = token;
  return token;
}

async function getToken(forceRefresh = false): Promise<CachedToken> {
  if (!forceRefresh && cachedToken && cachedToken.expiresAtMs > Date.now()) return cachedToken;
  return login();
}

export interface OlxLeadsPage {
  leads: OlxLeadPayload[];
  /** Correlated by adId === ad.id (per the task's documented, separate "OLX ad data" field list) - never embedded on the lead. Absent for any adId OLX didn't return ad data for. */
  ads: Map<string, OlxAdSnapshot>;
  rejected: number;
  page: number;
  pageSize: number;
  /** Best-effort: true when this page appears to be the last one for the requested window. */
  isLastPage: boolean;
}

export interface FetchLeadsParams {
  startDate: string; // OLX date format, produced by callers (see sync.ts)
  endDate: string;
  adIds?: string[];
  page?: number;
  pageSize?: number;
}

/**
 * Fetches a single page of leads. On a 403 (expired/invalid token) this
 * re-authenticates exactly once and retries the same request exactly once -
 * per the task's explicit "do NOT loop" requirement, a second 403 is
 * surfaced as a failure rather than retried again.
 */
export async function fetchLeadsPage(params: FetchLeadsParams): Promise<OlxLeadsPage> {
  const pageSize = Math.min(params.pageSize ?? OLX_MAX_PAGE_SIZE, OLX_MAX_PAGE_SIZE);
  const page = params.page ?? 1;

  const doFetch = async (token: CachedToken): Promise<Response> => {
    const url = new URL(`${getOlxApiBaseUrl()}/api/v1/leads`);
    url.searchParams.set("startDate", params.startDate);
    url.searchParams.set("endDate", params.endDate);
    url.searchParams.set("userId", token.userId);
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(pageSize));
    if (params.adIds?.length) url.searchParams.set("adIds", params.adIds.join(","));
    return fetch(url.toString(), { method: "GET", headers: { ...baseHeaders(), authorization: `Bearer ${token.accessToken}` } });
  };

  let token = await getToken();
  let response = await doFetch(token);

  if (response.status === 403) {
    logger.warn("olx_token_expired_reauthenticating", { page });
    token = await getToken(true);
    response = await doFetch(token);
    if (response.status === 403) {
      throw new OlxApiError(403, "OLX rejected the request with 403 even after re-authentication.");
    }
  }

  if (!response.ok) {
    throw new OlxApiError(response.status, `OLX leads fetch failed with status ${response.status}`);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new OlxApiError(response.status, "OLX leads response was not valid JSON.");
  }
  const envelope = olxLeadsResponseSchema.safeParse(json);
  const rawLeads = envelope.success ? envelope.data.leads ?? envelope.data.data ?? envelope.data.items ?? [] : Array.isArray(json) ? json : [];
  // Per the task's documented contract, "OLX ad data" (id/title/desc/price/
  // lat/long/parameters) is its own list, correlated to a lead by
  // `ad.id === lead.adId` - never read off the lead object itself.
  const rawAds = envelope.success ? envelope.data.ads ?? envelope.data.adData ?? envelope.data.adverts ?? [] : [];

  const leads: OlxLeadPayload[] = [];
  let rejected = 0;
  for (const raw of rawLeads) {
    const parsed = olxLeadSchema.safeParse(raw);
    if (parsed.success) leads.push(parsed.data);
    else {
      rejected++;
      logger.warn("olx_lead_rejected_malformed", { issueCount: parsed.error.issues.length });
    }
  }

  const ads = new Map<string, OlxAdSnapshot>();
  for (const raw of rawAds) {
    const parsed = olxAdSnapshotSchema.safeParse(raw);
    // A malformed/unparseable ad entry is simply dropped from the
    // correlation map - never rejects or blocks the leads on this page.
    if (parsed.success) ads.set(String(parsed.data.id), parsed.data);
  }

  // isLastPage is a heuristic (no reliable "hasMore"/"totalPages" field is
  // guaranteed to exist - see schema.ts ASSUMPTION note): a page that comes
  // back with fewer rows than requested cannot have a following page.
  const isLastPage = rawLeads.length < pageSize;
  return { leads, ads, rejected, page, pageSize, isLastPage };
}

/** Fetches every page for one <=7-day window, stopping when a page is short or a safety cap is hit. */
export async function fetchAllLeadsForWindow(startDate: string, endDate: string, adIds?: string[]): Promise<{ leads: OlxLeadPayload[]; ads: Map<string, OlxAdSnapshot>; rejected: number; pagesFetched: number }> {
  const MAX_PAGES = 500; // safety cap against a misbehaving/looping upstream response
  const allLeads: OlxLeadPayload[] = [];
  const allAds = new Map<string, OlxAdSnapshot>();
  let rejectedTotal = 0;
  let page = 1;
  for (; page <= MAX_PAGES; page++) {
    const result = await fetchLeadsPage({ startDate, endDate, adIds, page, pageSize: OLX_MAX_PAGE_SIZE });
    allLeads.push(...result.leads);
    for (const [id, ad] of result.ads) allAds.set(id, ad);
    rejectedTotal += result.rejected;
    if (result.isLastPage) return { leads: allLeads, ads: allAds, rejected: rejectedTotal, pagesFetched: page };
  }
  logger.error("olx_pagination_safety_cap_hit", { pagesFetched: MAX_PAGES });
  return { leads: allLeads, ads: allAds, rejected: rejectedTotal, pagesFetched: MAX_PAGES };
}
