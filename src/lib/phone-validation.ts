import { normalizeIndianPhone } from "@/integrations/whatsapp/phone";

/**
 * Single read-time phone interpreter for lead scoring / health / suggestions.
 *
 * Lead.phone is a legacy free-text column and some imported leads hold TWO
 * numbers in it ("6386190983 / 9506576678"). Stripping that to digits yields
 * 20 digits, which a "10 or 12 digits" check rejects - so the lead was scored
 * as having no valid phone. Here a stored value is first split into candidate
 * numbers and each is validated individually with the app's canonical
 * normalizeIndianPhone (10-digit mobile starting 6-9, optional 91 / 0 prefix).
 *
 * Read-time only: nothing here rewrites stored numbers.
 */

const SEPARATORS = /[\/,;|\n\r]+|\s+(?:and|or|&)\s+/i;

/** Split one stored value into candidate numbers. Spaces/hyphens inside a number are kept ("+91 95065 76678", "95065-76678"). */
export function splitPhoneCandidates(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const chunks = raw.split(SEPARATORS).map((c) => c.trim()).filter(Boolean);
  const out: string[] = [];
  for (const chunk of chunks) {
    if (normalizeIndianPhone(chunk)) {
      out.push(chunk);
      continue;
    }
    // "9506576678 6386190983" (space-separated pair): validate whitespace tokens individually.
    const tokens = chunk.split(/\s+/).filter(Boolean);
    const validTokens = tokens.filter((t) => normalizeIndianPhone(t));
    out.push(...(validTokens.length > 0 ? validTokens : [chunk]));
  }
  return out;
}

/** Every distinct valid number (normalized "91XXXXXXXXXX") across the given stored values, in input order. */
export function validIndianPhones(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    for (const candidate of splitPhoneCandidates(value)) {
      const normalized = normalizeIndianPhone(candidate);
      if (normalized) seen.add(normalized);
    }
  }
  return [...seen];
}

/** True when at least one stored value contains a usable Indian mobile number. */
export function hasValidIndianPhone(values: Array<string | null | undefined>): boolean {
  return validIndianPhones(values).length > 0;
}

/** First valid number as a 10-digit subscriber number (for tel: links), or null. */
export function firstDialablePhone(values: Array<string | null | undefined>): string | null {
  const first = validIndianPhones(values)[0];
  return first ? first.slice(-10) : null;
}
