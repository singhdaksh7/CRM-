import "server-only";
import { createHash, timingSafeEqual } from "crypto";
import { DEFAULT_ORGANIZATION_ID } from "@/lib/organization";

/**
 * 99acres inbound-webhook configuration - the only place that reads the
 * 99acres integration secret. 99acres calls this app; this app never calls
 * 99acres. The organization is resolved here, from server-side config only:
 * nothing in an incoming payload can select a tenant.
 *
 * The env var is deliberately `ACRES_99_*`, i.e. an
 * `ACRES_99_` prefix, not `99ACRES_*`: POSIX shells and many env-file
 * loaders reject variable names that start with a digit.
 */

const CANONICAL_PRODUCTION_URL = "https://crm.kpproperties.co.in";

export function getAcres99OrganizationId(): string {
  return process.env.ACRES_99_ORGANIZATION_ID?.trim() || DEFAULT_ORGANIZATION_ID;
}

/** Null (=> endpoint refuses all traffic) until an operator sets ACRES_99_WEBHOOK_SECRET. Never open by default. */
export function getAcres99WebhookSecret(): string | null {
  const value = process.env.ACRES_99_WEBHOOK_SECRET?.trim();
  return value ? value : null;
}

export function getAcres99WebhookUrl(): string {
  return `${CANONICAL_PRODUCTION_URL}/api/integrations/99acres/leads`;
}

/** `WWW-Authenticate` challenge sent with a 401. */
export const AUTH_CHALLENGE = 'Bearer realm="99acres-leads"';

export type Acres99AuthResult = "ok" | "missing" | "invalid";

/**
 * `Authorization: Bearer <secret>`. Both sides are hashed first so the
 * comparison is constant-time regardless of the candidate's length.
 */
export function checkAcres99Authorization(header: string | null, secret: string): Acres99AuthResult {
  if (!header) return "missing";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return "missing";
  const candidate = createHash("sha256").update(match[1].trim()).digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(candidate, expected) ? "ok" : "invalid";
}
