import { logger, newRequestId } from "./logger";

/**
 * Production-safe timing wrapper. Logs operation name, duration, route,
 * correlation ID, and success/failure through the existing structured
 * logger (which already redacts secret-shaped fields) - never the
 * arguments/result themselves, so this is safe to wrap around anything
 * (auth, DB queries, notification sweeps) without risking a cookie, token,
 * or query value ending up in logs.
 */
export async function withTiming<T>(
  operation: string,
  route: string,
  fn: () => Promise<T>,
  requestId: string = newRequestId()
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    logger.info("perf_timing", {
      operation,
      route,
      requestId,
      durationMs: Math.round(performance.now() - start),
      success: true,
    });
    return result;
  } catch (err) {
    logger.warn("perf_timing", {
      operation,
      route,
      requestId,
      durationMs: Math.round(performance.now() - start),
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
