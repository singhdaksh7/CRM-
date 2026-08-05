export interface Token {
  raw: string;
  lower: string;
}

/** Splits on whitespace only - deliberately simple, no NLP. Empty/whitespace-only input yields no tokens. */
export function tokenize(query: string): Token[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  return trimmed
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => ({ raw, lower: raw.toLowerCase() }));
}
