import * as Sentry from "@sentry/nextjs";

/**
 * Optional error-monitoring hook (Phase 3F). @sentry/nextjs is installed
 * (it's a free SDK - no paid service required to install or import it) but
 * completely inert unless SENTRY_DSN is set: `Sentry.init` is never called
 * without it, so no network calls to Sentry happen and no paid usage is
 * incurred. This is the one place every error-reporting call site in the
 * app (handleApiError) routes through, so swapping providers later is a
 * one-file change.
 */
let initialized = false;

function ensureInit() {
  if (initialized || !process.env.SENTRY_DSN) return;
  initialized = true;
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
}

export function captureException(err: unknown, context?: Record<string, unknown>) {
  if (!process.env.SENTRY_DSN) return;
  ensureInit();
  Sentry.captureException(err, { extra: context });
}
