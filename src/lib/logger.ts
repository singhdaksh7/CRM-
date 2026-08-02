import { randomUUID } from "crypto";

const REDACT_KEYS = new Set([
  "password", "passwordhash", "token", "accesstoken", "verifytoken", "appsecret", "secret",
  "authorization", "cookie", "otp", "aadhaar", "pan", "notes", "employeenotes", "clientfeedback",
]);

/**
 * Structured server-side logging boundary. Not wired to a paid provider -
 * this is a stdout JSON logger that any log shipper (Vercel Logs, CloudWatch,
 * Datadog, etc.) can pick up as-is; swapping in a provider later is a
 * one-file change (this module), not a call-site rewrite.
 */
function redactMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!meta) return meta;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    out[key] = REDACT_KEYS.has(key.toLowerCase()) ? "[REDACTED]" : value;
  }
  return out;
}

function write(level: "info" | "warn" | "error", event: string, meta?: Record<string, unknown>) {
  const line = { level, event, timestamp: new Date().toISOString(), ...redactMeta(meta) };
  const out = JSON.stringify(line);
  if (level === "error") console.error(out);
  else if (level === "warn") console.warn(out);
  else console.log(out);
}

export const logger = {
  info: (event: string, meta?: Record<string, unknown>) => write("info", event, meta),
  warn: (event: string, meta?: Record<string, unknown>) => write("warn", event, meta),
  error: (event: string, meta?: Record<string, unknown>) => write("error", event, meta),
};

/** One correlation ID per request/operation - thread it through logs, audit entries, and error responses so ops can trace a single failure end-to-end. */
export function newRequestId(): string {
  return randomUUID();
}
