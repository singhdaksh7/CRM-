/**
 * Hard safety gate for the whole E2E suite. Imported by playwright.config.ts
 * (global setup) and callable standalone. Throws — never warns — because a
 * silent pass here means a test could run against production.
 */
const ALLOWED_HOSTS = ["localhost", "127.0.0.1"];

export function assertSafeBaseUrl(baseURL: string) {
  let host: string;
  try {
    host = new URL(baseURL).hostname;
  } catch {
    throw new Error(`SAFETY GUARD: baseURL "${baseURL}" is not a valid URL.`);
  }
  if (/kpproperties\.co\.in/i.test(baseURL)) {
    throw new Error(
      `SAFETY GUARD: baseURL "${baseURL}" looks like the production KP Properties domain. Refusing to run.`
    );
  }
  if (!ALLOWED_HOSTS.includes(host)) {
    throw new Error(
      `SAFETY GUARD: baseURL host "${host}" is not in the allowed list (${ALLOWED_HOSTS.join(", ")}). Refusing to run.`
    );
  }
}

export function assertSafeDatabaseUrl(databaseUrl: string | undefined) {
  if (!databaseUrl) {
    throw new Error("SAFETY GUARD: DATABASE_URL is not set.");
  }
  let host: string;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    throw new Error("SAFETY GUARD: DATABASE_URL is not a valid connection string.");
  }
  if (!ALLOWED_HOSTS.includes(host)) {
    throw new Error(
      `SAFETY GUARD: DATABASE_URL host "${host}" is not local (${ALLOWED_HOSTS.join(", ")}). Refusing to run migrations/tests.`
    );
  }
}
