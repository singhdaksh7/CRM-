/**
 * Runs once when the Next.js server process starts (both `next dev` and
 * `next start`), before it serves any request - the "fail fast" hook for
 * Phase 3D environment validation. If required env vars are missing or
 * malformed, the process exits immediately with a clear message instead of
 * coming up and failing confusingly on whichever request first touches the
 * broken config.
 */
export async function register() {
  // Only meaningful in the Node.js runtime (not the edge runtime, which
  // doesn't run this file's Node-only env-check logic the same way).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("./lib/env");
    try {
      validateEnv();
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }

  }
}
