import "server-only";

/**
 * TEMPORARY PERFORMANCE DIAGNOSTIC
 *
 * This gate intentionally requires Vercel's Preview environment in addition
 * to the explicit opt-in flag. A production deployment cannot expose this
 * diagnostic surface, even if the flag is accidentally configured there.
 */
export function performanceDiagnosticsEnabled(): boolean {
  return process.env.VERCEL_ENV === "preview" && process.env.PERF_DIAGNOSTICS_ENABLED === "1";
}
