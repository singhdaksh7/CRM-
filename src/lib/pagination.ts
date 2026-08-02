const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/** Clamps a client-supplied page size into a safe range - never unbounded, never zero. */
export function readTake(searchParams: URLSearchParams, fallback = DEFAULT_PAGE_SIZE): number {
  const raw = Number(searchParams.get("take"));
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(Math.floor(raw), MAX_PAGE_SIZE);
}

export function readSkip(searchParams: URLSearchParams): number {
  const raw = Number(searchParams.get("skip"));
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.floor(raw);
}
