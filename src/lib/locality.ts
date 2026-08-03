export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface LocalityDefinition {
  /** The single canonical spelling stored/displayed everywhere. */
  canonical: string;
  /** Lowercase, whitespace-normalized alternate spellings that should resolve to `canonical`. */
  aliases: string[];
  /** Approximate, publicly-known locality center - used only as a fallback reference point for nearby-property distance when a property has no real geocoded coordinate yet. Never a private address. */
  centroid: Coordinates | null;
}

/**
 * Delhi locality normalization layer. Deliberately conservative: an input
 * that doesn't match a known canonical name or alias is returned unchanged
 * (with `matched: false`) rather than guessed or merged into the closest
 * looking entry - "Vasant Vihar" and "Vasant Kunj" are genuinely different
 * places and must never collapse into one just because they're similar
 * strings. New localities/aliases should be added here explicitly as
 * they're encountered, not inferred by fuzzy matching.
 */
export const DELHI_LOCALITIES: LocalityDefinition[] = [
  { canonical: "Janakpuri", aliases: ["janak puri", "janakpuri"], centroid: { latitude: 28.6219, longitude: 77.0878 } },
  { canonical: "Dwarka", aliases: ["dwarka"], centroid: { latitude: 28.5921, longitude: 77.046 } },
  { canonical: "Dwarka Sector 12", aliases: ["dwarka sec 12", "dwarka sector 12", "dwarka sec-12"], centroid: { latitude: 28.5735, longitude: 77.0589 } },
  { canonical: "Rajouri Garden", aliases: ["rajori garden", "rajouri garden"], centroid: { latitude: 28.6465, longitude: 77.1201 } },
  { canonical: "Uttam Nagar", aliases: ["uttam nagar", "uttamnagar"], centroid: { latitude: 28.6193, longitude: 77.0587 } },
  { canonical: "Rohini", aliases: ["rohini"], centroid: { latitude: 28.7414, longitude: 77.0714 } },
  { canonical: "Pitampura", aliases: ["pitam pura", "pitampura"], centroid: { latitude: 28.6988, longitude: 77.1317 } },
  { canonical: "Vasant Kunj", aliases: ["vasant kunj"], centroid: { latitude: 28.5244, longitude: 77.1585 } },
  { canonical: "Vasant Vihar", aliases: ["vasant vihar"], centroid: { latitude: 28.5606, longitude: 77.1588 } },
  { canonical: "Saket", aliases: ["saket"], centroid: { latitude: 28.5245, longitude: 77.21 } },
  { canonical: "Greater Kailash", aliases: ["greater kailash", "gk", "gk 1", "gk 2", "gk-1", "gk-2"], centroid: { latitude: 28.5494, longitude: 77.2425 } },
  { canonical: "Lajpat Nagar", aliases: ["lajpat nagar", "lajpatnagar"], centroid: { latitude: 28.5677, longitude: 77.2431 } },
  { canonical: "Karol Bagh", aliases: ["karol bagh", "karolbagh"], centroid: { latitude: 28.6519, longitude: 77.1909 } },
  { canonical: "Paschim Vihar", aliases: ["paschim vihar", "pashchim vihar"], centroid: { latitude: 28.6692, longitude: 77.1 } },
  { canonical: "Vikaspuri", aliases: ["vikas puri", "vikaspuri"], centroid: { latitude: 28.6377, longitude: 77.0761 } },
  { canonical: "Connaught Place", aliases: ["connaught place", "cp"], centroid: { latitude: 28.6315, longitude: 77.2167 } },
];

function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\bsec\.?\b/g, "sector"); // "Sec 12" / "Sec. 12" -> "sector 12", handled before alias lookup
}

const ALIAS_INDEX = new Map<string, LocalityDefinition>();
for (const def of DELHI_LOCALITIES) {
  ALIAS_INDEX.set(normalizeKey(def.canonical), def);
  for (const alias of def.aliases) ALIAS_INDEX.set(normalizeKey(alias), def);
}

export interface NormalizeLocalityResult {
  /** The canonical name if matched, otherwise the original input, whitespace-trimmed only. */
  canonical: string;
  /** The exact string the user/import originally entered - always preserved. */
  original: string;
  matched: boolean;
}

/** Looks up a free-text locality against the known alias table. Never merges two genuinely different localities - an unmatched input passes through unchanged. */
export function normalizeLocality(input: string): NormalizeLocalityResult {
  const original = input.trim();
  const match = ALIAS_INDEX.get(normalizeKey(original));
  if (match) return { canonical: match.canonical, original, matched: true };
  return { canonical: original, original, matched: false };
}

/** Returns the known reference centroid for a locality name, if any - used as a nearby-matching fallback when a property has no real geocoded coordinate. */
export function getLocalityCentroid(localityName: string): Coordinates | null {
  const match = ALIAS_INDEX.get(normalizeKey(localityName));
  return match?.centroid ?? null;
}

export function listKnownLocalities(): string[] {
  return DELHI_LOCALITIES.map((d) => d.canonical);
}
