/**
 * Normalizes an Indian phone number to E.164-ish digits-only form used as
 * the wa.me path segment and the DB conversation key: "919876543210".
 * Returns null for anything that isn't a plausible Indian mobile number.
 */
export function normalizeIndianPhone(raw: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");

  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91") && /^91[6-9]/.test(digits)) return digits;
  if (digits.length === 11 && digits.startsWith("0") && /^0[6-9]/.test(digits)) return `91${digits.slice(1)}`;

  return null;
}

export function isValidIndianPhone(raw: string): boolean {
  return normalizeIndianPhone(raw) !== null;
}
