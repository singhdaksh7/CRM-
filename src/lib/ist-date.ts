/**
 * Timezone-aware day boundaries for Asia/Kolkata (IST, UTC+5:30, no DST) -
 * used by the Phase 3 analytics modules so "today" means the broker's
 * actual business day, not whatever timezone the server process happens to
 * run in (Vercel functions run in UTC by default; a lead created at
 * 9:30pm IST is 4:00pm UTC the same day, but one created at 11pm IST is
 * already the next UTC day - `new Date().setHours(0,0,0,0)` gets that
 * wrong). Pre-existing dashboard/notification modules elsewhere in this
 * codebase still use server-local day boundaries (src/lib/dashboard-data.ts,
 * src/lib/notifications.ts, src/lib/assignment.ts) - a known, pre-existing
 * inconsistency, out of scope to change here since Phase 3 must not
 * silently alter already-shipped behavior.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The instant that is midnight IST on the IST calendar date containing `now`. */
export function startOfIstDay(now: Date = new Date()): Date {
  const istMillis = now.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istMillis);
  const istMidnightAsUtc = Date.UTC(istDate.getUTCFullYear(), istDate.getUTCMonth(), istDate.getUTCDate());
  return new Date(istMidnightAsUtc - IST_OFFSET_MS);
}

/** The instant just before the next IST midnight after `now`. */
export function endOfIstDay(now: Date = new Date()): Date {
  return new Date(startOfIstDay(now).getTime() + 24 * 60 * 60 * 1000 - 1);
}

/** Start of the IST calendar week (Sunday) containing `now`. */
export function startOfIstWeek(now: Date = new Date()): Date {
  const istMillis = now.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istMillis);
  const dayOfWeek = istDate.getUTCDay();
  const istWeekStartAsUtc = Date.UTC(istDate.getUTCFullYear(), istDate.getUTCMonth(), istDate.getUTCDate() - dayOfWeek);
  return new Date(istWeekStartAsUtc - IST_OFFSET_MS);
}

export function startOfIstMonth(now: Date = new Date()): Date {
  const istMillis = now.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istMillis);
  const istMonthStartAsUtc = Date.UTC(istDate.getUTCFullYear(), istDate.getUTCMonth(), 1);
  return new Date(istMonthStartAsUtc - IST_OFFSET_MS);
}

/** "YYYY-MM" bucket key for an instant, keyed by its IST calendar month - used for grouping trend/monthly data consistently regardless of server timezone. */
export function istMonthKey(d: Date): string {
  const istMillis = d.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istMillis);
  return `${istDate.getUTCFullYear()}-${String(istDate.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Human label (e.g. "Aug 26") for an IST month key produced by istMonthKey. */
export function istMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
}
