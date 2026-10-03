import "server-only";

/** Hard cap on an inbound body. A lead is a few hundred bytes; this is generous headroom, not an expected size. */
export const MAX_BODY_BYTES = 64 * 1024;

export type ParsedBody =
  | { ok: true; payload: Record<string, unknown>; format: "json" | "form" }
  | { ok: false; status: 400 | 415; reason: "empty" | "malformed" | "not_object" | "unsupported_media_type" };

/** Reads the body with a hard byte ceiling, so a missing/lying Content-Length cannot make us buffer an unbounded stream. */
export async function readCappedText(request: Request, maxBytes = MAX_BODY_BYTES): Promise<{ text: string } | { tooLarge: true }> {
  if (!request.body) return { text: "" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { tooLarge: true };
    }
    chunks.push(value);
  }
  return { text: Buffer.concat(chunks).toString("utf8") };
}

function formToObject(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of new URLSearchParams(text)) {
    if (key in out) out[key] = Array.isArray(out[key]) ? [...(out[key] as unknown[]), value] : [out[key], value];
    else out[key] = value;
  }
  return out;
}

export function parseBody(text: string, contentType: string): ParsedBody {
  const type = contentType.toLowerCase();
  if (!text.trim()) return { ok: false, status: 400, reason: "empty" };

  const parseJson = (): ParsedBody => {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      return { ok: false, status: 400, reason: "malformed" };
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, status: 400, reason: "not_object" };
    return { ok: true, payload: value as Record<string, unknown>, format: "json" };
  };

  if (type.includes("application/x-www-form-urlencoded")) {
    const payload = formToObject(text);
    return Object.keys(payload).length ? { ok: true, payload, format: "form" } : { ok: false, status: 400, reason: "malformed" };
  }
  if (type.includes("json")) return parseJson();
  // The sender's format is unconfirmed: tolerate a missing/"text/plain" content type when the body is plainly JSON.
  if ((!type || type.includes("text/plain")) && /^\s*\{/.test(text)) return parseJson();
  return { ok: false, status: 415, reason: "unsupported_media_type" };
}

// ---------------------------------------------------------------------------
// Sanitising: what we persist for later inspection of the first real payload.
// ---------------------------------------------------------------------------

const SECRET_KEY = /authorization|cookie|secret|token|passw(or)?d|api[-_ ]?key|apikey|signature|bearer|credential/i;
const MAX_DEPTH = 6;
const MAX_KEYS = 200;
const MAX_STRING = 4000;

/**
 * Deep copy of the payload that is safe to store: credential-looking keys are
 * redacted, any value that contains the webhook secret itself is redacted, and
 * size/depth are bounded. Unknown fields are otherwise preserved verbatim.
 * (Request headers are never part of the payload and are never stored.)
 */
export function sanitizePayload(value: unknown, secret?: string | null, depth = 0): unknown {
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (secret && value.includes(secret)) return "[REDACTED]";
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}...[truncated]` : value;
  }
  if (depth >= MAX_DEPTH) return "[max depth]";
  if (Array.isArray(value)) return value.slice(0, MAX_KEYS).map((item) => sanitizePayload(item, secret, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>).slice(0, MAX_KEYS)) {
      out[key.slice(0, 200)] = SECRET_KEY.test(key) ? "[REDACTED]" : sanitizePayload(inner, secret, depth + 1);
    }
    return out;
  }
  return String(value);
}

// ---------------------------------------------------------------------------
// Field lookup
// ---------------------------------------------------------------------------

/** "Lead_Name", "leadName", "lead name" and "LEADNAME" all become "leadname". */
export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface FlatEntry {
  key: string;
  normalized: string;
  value: unknown;
  depth: number;
}

/** Breadth-first flatten (shallowest first) so an envelope like {data:{...}} is read the same as a flat body. */
export function flattenPayload(payload: Record<string, unknown>, maxDepth = 3): FlatEntry[] {
  const out: FlatEntry[] = [];
  let level: Array<Record<string, unknown>> = [payload];
  for (let depth = 0; depth <= maxDepth && level.length; depth += 1) {
    const next: Array<Record<string, unknown>> = [];
    for (const object of level) {
      for (const [key, value] of Object.entries(object)) {
        out.push({ key, normalized: normalizeKey(key), value, depth });
        if (value && typeof value === "object" && !Array.isArray(value)) next.push(value as Record<string, unknown>);
      }
    }
    level = next;
  }
  return out;
}

/** Scalar -> trimmed string. Objects/arrays/empty values are not scalar fields. */
export function scalar(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    const lower = trimmed.toLowerCase();
    return trimmed && lower !== "null" && lower !== "undefined" ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return undefined;
}

/** First alias (in priority order) that has a scalar value anywhere in the payload, shallowest match first. */
export function pick(entries: FlatEntry[], aliases: readonly string[]): { value: string; key: string } | undefined {
  for (const alias of aliases) {
    const wanted = normalizeKey(alias);
    const hit = entries.find((entry) => entry.normalized === wanted && scalar(entry.value) !== undefined);
    if (hit) return { value: scalar(hit.value)!, key: hit.key };
  }
  return undefined;
}
