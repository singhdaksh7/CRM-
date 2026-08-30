/**
 * Content-Security-Policy builder used by next.config.ts.
 *
 * Kept as a pure module (no Next runtime imports) so:
 * - next.config can import it at build/start time
 * - unit tests can assert CSP shape without spinning up Next
 *
 * Storage origins are derived only from server env (R2_ENDPOINT /
 * R2_ACCOUNT_ID / R2_BUCKET_NAME). Request input must never feed this builder.
 *
 * AWS SDK virtual-hosted-style R2 URLs use:
 *   https://{bucket}.{accountId}.r2.cloudflarestorage.com
 * which is a different origin from the account API endpoint:
 *   https://{accountId}.r2.cloudflarestorage.com
 * CSP must allow the origin the browser actually contacts.
 */

const R2_HOST_SUFFIX = ".r2.cloudflarestorage.com";

/** S3/R2 bucket DNS label - no spaces/semicolons that could break CSP. */
const R2_BUCKET_RE = /^[a-z0-9](?:[a-z0-9.-]{0,61}[a-z0-9])?$/;
const R2_ACCOUNT_ID_RE = /^[a-f0-9]+$/i;

function isSafeCspOrigin(origin: string): boolean {
  return !!origin && origin.startsWith("https://") && !/[;\s,]/.test(origin);
}

function parseHttpsR2Origin(candidate: string): string | null {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "443") return null;
  if (!url.hostname.toLowerCase().endsWith(R2_HOST_SUFFIX)) return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  if (url.search || url.hash) return null;

  const origin = url.origin;
  return isSafeCspOrigin(origin) ? origin : null;
}

function resolveAccountId(env: NodeJS.Dict<string | undefined>): string | null {
  const accountId = env.R2_ACCOUNT_ID?.trim();
  if (accountId && R2_ACCOUNT_ID_RE.test(accountId)) return accountId;

  const endpoint = env.R2_ENDPOINT?.trim();
  if (!endpoint) return null;
  try {
    const host = new URL(endpoint).hostname.toLowerCase();
    if (!host.endsWith(R2_HOST_SUFFIX)) return null;
    const label = host.slice(0, -R2_HOST_SUFFIX.length);
    // Account API host is a single hex label; reject virtual-host hosts here.
    if (!R2_ACCOUNT_ID_RE.test(label)) return null;
    return label;
  } catch {
    return null;
  }
}

/**
 * Account API endpoint origin, e.g.
 * https://{accountId}.r2.cloudflarestorage.com
 */
export function resolveTrustedStorageCspOrigin(
  env: NodeJS.Dict<string | undefined> = process.env
): string | null {
  const provider = (env.STORAGE_PROVIDER || "").trim().toUpperCase();
  if (provider !== "R2") return null;

  const endpoint = env.R2_ENDPOINT?.trim();
  if (endpoint) return parseHttpsR2Origin(endpoint);

  const accountId = resolveAccountId(env);
  if (!accountId) return null;
  return parseHttpsR2Origin(`https://${accountId}${R2_HOST_SUFFIX}`);
}

/**
 * Virtual-hosted bucket origin used by AWS SDK getSignedUrl when
 * forcePathStyle=false, e.g.
 * https://{bucket}.{accountId}.r2.cloudflarestorage.com
 */
export function resolveTrustedStorageVirtualHostCspOrigin(
  env: NodeJS.Dict<string | undefined> = process.env
): string | null {
  const provider = (env.STORAGE_PROVIDER || "").trim().toUpperCase();
  if (provider !== "R2") return null;

  const bucket = env.R2_BUCKET_NAME?.trim();
  const accountId = resolveAccountId(env);
  if (!bucket || !accountId) return null;
  if (!R2_BUCKET_RE.test(bucket)) return null;
  if (bucket.includes("..")) return null;

  return parseHttpsR2Origin(`https://${bucket}.${accountId}${R2_HOST_SUFFIX}`);
}

/** Deduped trusted R2 origins for connect-src / img-src. */
export function resolveTrustedStorageCspOrigins(
  env: NodeJS.Dict<string | undefined> = process.env
): string[] {
  const origins: string[] = [];
  const push = (origin: string | null) => {
    if (origin && !origins.includes(origin)) origins.push(origin);
  };
  push(resolveTrustedStorageCspOrigin(env));
  push(resolveTrustedStorageVirtualHostCspOrigin(env));
  return origins;
}

export function buildContentSecurityPolicy(
  env: NodeJS.Dict<string | undefined> = process.env
): string {
  const storageOrigins = resolveTrustedStorageCspOrigins(env);

  const imgSources = ["'self'", "data:", "blob:", "https://images.unsplash.com", ...storageOrigins];
  const connectSources = ["'self'", ...storageOrigins];

  // `next dev`'s React Fast Refresh runtime (@next/react-refresh-utils)
  // unconditionally eval()s module updates as part of how HMR works - this
  // is unrelated to and not fixable via the webpack `devtool`/source-map
  // setting. That eval is blocked by a strict script-src, silently breaking
  // client-side interactivity (e.g. the login form's signIn() call never
  // completing) under `next dev`. Gated strictly on NODE_ENV === "development"
  // (never "production", and Vitest's default NODE_ENV of "test" also keeps
  // the strict policy) so the CSP actually served by `next build`/`next start`
  // - the only thing a real client ever receives - is byte-for-byte
  // unchanged; this only relaxes the policy for the local `next dev` server.
  const scriptSrc = env.NODE_ENV === "development" ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'";

  // Phase 3J - production security headers. CSP note: `script-src` includes
  // 'unsafe-inline' because Next.js App Router injects a small inline
  // bootstrap/hydration script on every page; tightening to a nonce-based
  // policy is a documented follow-up (see SECURITY.md).
  return [
    "default-src 'self'",
    `img-src ${imgSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    scriptSrc,
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

/** Extract connect-src / img-src source tokens from a CSP string (test helper). */
export function cspDirectiveSources(csp: string, directive: "connect-src" | "img-src"): string[] {
  const part = csp
    .split(";")
    .map((s) => s.trim())
    .find((d) => d.startsWith(`${directive} `));
  if (!part) return [];
  return part.slice(directive.length).trim().split(/\s+/).filter(Boolean);
}
