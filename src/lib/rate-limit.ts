import Redis from "ioredis";
import { NextResponse } from "next/server";

/**
 * Fixed-window rate limiter backed by any standard Redis (works identically
 * against local Docker Redis, Upstash's Redis-protocol endpoint, or any
 * other managed Redis - `ioredis` speaks the wire protocol, not a
 * provider-specific REST API, so this isn't locked to one vendor).
 *
 * If REDIS_URL is not set, rate limiting is a no-op (always allowed) - this
 * is intentional so local development without Docker/Redis running never
 * blocks on limiter failures; it also means limits are NOT enforced unless
 * REDIS_URL is set in the deployment environment (see DEPLOYMENT.md).
 */

let client: Redis | null | undefined;

function getClient(): Redis | null {
  if (client !== undefined) return client;
  const url = process.env.REDIS_URL;
  if (!url) {
    client = null;
    return null;
  }
  client = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: false, enableOfflineQueue: true });
  client.on("error", (err) => console.error(JSON.stringify({ level: "error", event: "redis_error", message: err.message })));
  return client;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

export interface RateLimitRule {
  limit: number;
  windowSeconds: number;
}

/** Named, env-overridable rate-limit presets for each public/sensitive surface. */
export const RATE_LIMITS: Record<string, RateLimitRule> = {
  login: { limit: Number(process.env.RATE_LIMIT_LOGIN_MAX ?? 10), windowSeconds: Number(process.env.RATE_LIMIT_LOGIN_WINDOW_SECONDS ?? 300) },
  publicCatalogue: { limit: Number(process.env.RATE_LIMIT_CATALOGUE_MAX ?? 60), windowSeconds: Number(process.env.RATE_LIMIT_CATALOGUE_WINDOW_SECONDS ?? 60) },
  webhook: { limit: Number(process.env.RATE_LIMIT_WEBHOOK_MAX ?? 120), windowSeconds: Number(process.env.RATE_LIMIT_WEBHOOK_WINDOW_SECONDS ?? 60) },
  import: { limit: Number(process.env.RATE_LIMIT_IMPORT_MAX ?? 5), windowSeconds: Number(process.env.RATE_LIMIT_IMPORT_WINDOW_SECONDS ?? 300) },
  upload: { limit: Number(process.env.RATE_LIMIT_UPLOAD_MAX ?? 30), windowSeconds: Number(process.env.RATE_LIMIT_UPLOAD_WINDOW_SECONDS ?? 60) },
  document: { limit: Number(process.env.RATE_LIMIT_DOCUMENT_MAX ?? 100), windowSeconds: Number(process.env.RATE_LIMIT_DOCUMENT_WINDOW_SECONDS ?? 60) },
  payment: { limit: Number(process.env.RATE_LIMIT_PAYMENT_MAX ?? 30), windowSeconds: Number(process.env.RATE_LIMIT_PAYMENT_WINDOW_SECONDS ?? 60) },
  // Storage (Phase 1 Firebase integration) - upload-authorization and
  // verification reuse `upload`/`document` above; these cover the
  // operations that don't have an existing bucket.
  documentDownload: { limit: Number(process.env.RATE_LIMIT_DOCUMENT_DOWNLOAD_MAX ?? 60), windowSeconds: Number(process.env.RATE_LIMIT_DOCUMENT_DOWNLOAD_WINDOW_SECONDS ?? 60) },
  documentReplace: { limit: Number(process.env.RATE_LIMIT_DOCUMENT_REPLACE_MAX ?? 20), windowSeconds: Number(process.env.RATE_LIMIT_DOCUMENT_REPLACE_WINDOW_SECONDS ?? 60) },
  documentDelete: { limit: Number(process.env.RATE_LIMIT_DOCUMENT_DELETE_MAX ?? 20), windowSeconds: Number(process.env.RATE_LIMIT_DOCUMENT_DELETE_WINDOW_SECONDS ?? 60) },
  propertyImageUpload: { limit: Number(process.env.RATE_LIMIT_PROPERTY_IMAGE_UPLOAD_MAX ?? 30), windowSeconds: Number(process.env.RATE_LIMIT_PROPERTY_IMAGE_UPLOAD_WINDOW_SECONDS ?? 60) },
  propertyImageAccess: { limit: Number(process.env.RATE_LIMIT_PROPERTY_IMAGE_ACCESS_MAX ?? 120), windowSeconds: Number(process.env.RATE_LIMIT_PROPERTY_IMAGE_ACCESS_WINDOW_SECONDS ?? 60) },
  // WhatsApp Cloud API production hardening - deliberately generous limits
  // for normal brokerage usage (a busy agent sending to many leads a day is
  // normal); "webhook" above already covers Meta's own redelivery traffic
  // and is intentionally left untouched/not tightened further.
  whatsappSend: { limit: Number(process.env.RATE_LIMIT_WHATSAPP_SEND_MAX ?? 60), windowSeconds: Number(process.env.RATE_LIMIT_WHATSAPP_SEND_WINDOW_SECONDS ?? 60) },
  whatsappRetry: { limit: Number(process.env.RATE_LIMIT_WHATSAPP_RETRY_MAX ?? 20), windowSeconds: Number(process.env.RATE_LIMIT_WHATSAPP_RETRY_WINDOW_SECONDS ?? 60) },
  whatsappTestConnection: { limit: Number(process.env.RATE_LIMIT_WHATSAPP_TEST_CONNECTION_MAX ?? 10), windowSeconds: Number(process.env.RATE_LIMIT_WHATSAPP_TEST_CONNECTION_WINDOW_SECONDS ?? 300) },
  whatsappTestSend: { limit: Number(process.env.RATE_LIMIT_WHATSAPP_TEST_SEND_MAX ?? 3), windowSeconds: Number(process.env.RATE_LIMIT_WHATSAPP_TEST_SEND_WINDOW_SECONDS ?? 3600) },
};

/**
 * Checks and increments a fixed-window counter atomically (INCR returns the
 * new value; EXPIRE is only set on the first increment of a window so the
 * window doesn't keep sliding forward on every request).
 */
export async function checkRateLimit(ruleName: keyof typeof RATE_LIMITS, identifier: string): Promise<RateLimitResult> {
  const rule = RATE_LIMITS[ruleName];
  const redis = getClient();
  if (!redis) return { allowed: true, limit: rule.limit, remaining: rule.limit, resetSeconds: rule.windowSeconds };

  const key = `ratelimit:${ruleName}:${identifier}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, rule.windowSeconds);
    const ttl = await redis.ttl(key);
    const resetSeconds = ttl > 0 ? ttl : rule.windowSeconds;
    return { allowed: count <= rule.limit, limit: rule.limit, remaining: Math.max(rule.limit - count, 0), resetSeconds };
  } catch {
    // Redis unreachable - fail open rather than taking the whole app down over a limiter outage.
    return { allowed: true, limit: rule.limit, remaining: rule.limit, resetSeconds: rule.windowSeconds };
  }
}

/** Best-effort client identifier for unauthenticated routes - real deployments should sit behind a proxy that sets x-forwarded-for. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export function rateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: "Too many requests - please slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": String(result.resetSeconds), "X-RateLimit-Limit": String(result.limit), "X-RateLimit-Remaining": "0" } }
  );
}
