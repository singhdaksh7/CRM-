const DEFAULT_COUNTRY_CODE = "91";

/**
 * Normalizes an Indian phone number to E.164-ish digits-only form used as
 * the wa.me path segment and the DB conversation key: "919876543210".
 * Returns null for anything that isn't a plausible Indian mobile number -
 * this never guesses or silently rewrites a malformed/foreign number, it
 * only ever accepts the exact shapes below.
 *
 * `countryCode` defaults to "91" but is configurable (WHATSAPP_DEFAULT_COUNTRY_CODE)
 * so the international prefix isn't hardcoded at every call site - see
 * whatsapp-config.ts#defaultCountryCode and its call sites (meta-whatsapp-provider.ts,
 * click-to-chat-provider.ts, whatsapp-conversations.ts). The digit-shape
 * validation itself (10-digit mobile starting 6-9, optional leading 0 trunk
 * prefix) stays India-specific since this CRM only serves Indian numbers.
 */
export function normalizeIndianPhone(raw: string, countryCode: string = DEFAULT_COUNTRY_CODE): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  const cc = countryCode.replace(/[^\d]/g, "") || DEFAULT_COUNTRY_CODE;

  if (digits.length === 10 && /^[6-9]/.test(digits)) return `${cc}${digits}`;
  if (digits.length === 10 + cc.length && digits.startsWith(cc) && new RegExp(`^${cc}[6-9]`).test(digits)) return digits;
  if (digits.length === 11 && digits.startsWith("0") && /^0[6-9]/.test(digits)) return `${cc}${digits.slice(1)}`;

  return null;
}

export function isValidIndianPhone(raw: string, countryCode?: string): boolean {
  return normalizeIndianPhone(raw, countryCode) !== null;
}
