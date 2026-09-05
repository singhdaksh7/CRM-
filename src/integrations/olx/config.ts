import "server-only";

/**
 * OLX Dealer Lead Sharing API configuration - the only place in the codebase
 * that reads OLX credential environment variables. Every getter re-reads
 * process.env at call time (never cached at module load) so tests can mutate
 * env between cases and so a serverless cold start always sees the current
 * value. Nothing here is ever logged.
 */

const DEFAULT_BASE_URL = "https://business.olx.in";

export function getOlxDealerLogin(): string | null {
  const value = process.env.OLX_DEALER_LOGIN?.trim();
  return value ? value : null;
}

export function getOlxDealerPassword(): string | null {
  const value = process.env.OLX_DEALER_PASSWORD?.trim();
  return value ? value : null;
}

export function getOlxApiBaseUrl(): string {
  return process.env.OLX_API_BASE_URL?.trim() || DEFAULT_BASE_URL;
}

export function isOlxConfigured(): boolean {
  return Boolean(getOlxDealerLogin() && getOlxDealerPassword());
}

/**
 * Deliberate live-ingestion guard. Credentials alone only permit the separate
 * authentication/contract check; an operator must explicitly enable CRM
 * ingestion after that review. Defaults to false in every environment.
 */
export function isOlxLiveIngestionEnabled(): boolean {
  return process.env.OLX_LIVE_INGESTION_ENABLED === "true";
}

/**
 * The official SOP requires `x-origin-panamera: dev` for development and
 * testing. Production deployments never send it.
 */
export function shouldSendOlxDevHeader(): boolean {
  return process.env.NODE_ENV !== "production";
}

/** First-sync lookback window (hours) when a connection has no lastSuccessfulSyncAt cursor yet. */
export function getOlxInitialLookbackHours(): number {
  const raw = Number(process.env.OLX_INITIAL_LOOKBACK_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 24;
}

/** Overlap window (minutes) subtracted from lastSuccessfulSyncAt so a transient failure can never silently lose leads. */
export function getOlxSyncOverlapMinutes(): number {
  const raw = Number(process.env.OLX_SYNC_OVERLAP_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? raw : 10;
}

/** OLX's own documented maximum date-range span (days) per leads-fetch request. */
export const OLX_MAX_DATE_RANGE_DAYS = 7;
/** OLX's own documented maximum page size. */
export const OLX_MAX_PAGE_SIZE = 100;
/** Access token validity per the task ("15 minutes"); a safety margin is applied when caching within one invocation. */
export const OLX_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export function presence() {
  return {
    dealerLoginConfigured: Boolean(getOlxDealerLogin()),
    dealerPasswordConfigured: Boolean(getOlxDealerPassword()),
    liveIngestionEnabled: isOlxLiveIngestionEnabled(),
    apiBaseUrlConfigured: Boolean(process.env.OLX_API_BASE_URL?.trim()),
    devModeEnabled: shouldSendOlxDevHeader(),
  };
}
