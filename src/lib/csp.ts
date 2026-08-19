/**
 * Content-Security-Policy builder used by next.config.ts.
 *
 * Kept as a pure module (no Next runtime imports) so:
 * - next.config can import it at build/start time
 * - unit tests can assert CSP shape without spinning up Next
 *
 * Storage origins are derived only from server env (R2_ENDPOINT /
 * R2_ACCOUNT_ID). Request input must never feed this builder.
 */

const R2_HOST_SUFFIX = ".r2.cloudflarestorage.com";

/** Extract a single trusted HTTPS origin suitable for a CSP source list. */
export function resolveTrustedStorageCspOrigin(
  env: NodeJS.Dict<string | undefined> = process.env
): string | null {
  const provider = (env.STORAGE_PROVIDER || "").trim().toUpperCase();
  if (provider !== "R2") return null;

  const endpoint = env.R2_ENDPOINT?.trim();
  const accountId = env.R2_ACCOUNT_ID?.trim();

  let candidate: string | null = null;
  if (endpoint) {
    candidate = endpoint;
  } else if (accountId && /^[a-f0-9]+$/i.test(accountId)) {
    candidate = `https://${accountId}${R2_HOST_SUFFIX}`;
  }
  if (!candidate) return null;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  // Reject anything that isn't a plain https origin we control via env.
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "443") return null;
  if (!url.hostname.toLowerCase().endsWith(R2_HOST_SUFFIX)) return null;
  // Hostname labels only - blocks path/query smuggling into the source token.
  if (url.pathname !== "/" && url.pathname !== "") return null;
  if (url.search || url.hash) return null;

  const origin = url.origin;
  // CSP source lists are semicolon/space delimited - refuse metacharacters.
  if (!origin || /[;\s,]/.test(origin)) return null;
  return origin;
}

export function buildContentSecurityPolicy(
  env: NodeJS.Dict<string | undefined> = process.env
): string {
  const storageOrigin = resolveTrustedStorageCspOrigin(env);

  const imgSources = ["'self'", "data:", "blob:", "https://images.unsplash.com"];
  const connectSources = ["'self'"];
  if (storageOrigin) {
    imgSources.push(storageOrigin);
    connectSources.push(storageOrigin);
  }

  // Phase 3J - production security headers. CSP note: `script-src` includes
  // 'unsafe-inline' because Next.js App Router injects a small inline
  // bootstrap/hydration script on every page; tightening to a nonce-based
  // policy is a documented follow-up (see SECURITY.md).
  return [
    "default-src 'self'",
    `img-src ${imgSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    // Phase 4 - PWA: required for public/sw.js and manifest.json.
    "worker-src 'self'",
    "manifest-src 'self'",
  ].join("; ");
}
