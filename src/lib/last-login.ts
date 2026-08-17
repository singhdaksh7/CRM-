/**
 * Human formatting for `User.lastLoginAt` in the admin employee list/detail.
 *
 * "Today 10:42 AM" / "Yesterday 6:15 PM" / "12 Aug 2026" / "Never". Only the
 * timestamp is ever shown - no IP, no user agent, no device fingerprint. The
 * schema has ipAddress/device columns on AuditLog but they are placeholders
 * that are never populated (see src/lib/audit.ts), so there is nothing real
 * to show and nothing is invented here.
 *
 * Times render in Asia/Kolkata to match the rest of the app (`formatDate`,
 * `formatDateTime` in src/lib/utils.ts use the en-IN locale), so an admin in
 * Delhi and the server agree on what "today" means.
 */
const TIME_ZONE = "Asia/Kolkata";

const timeFormat = new Intl.DateTimeFormat("en-IN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: TIME_ZONE,
});

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: TIME_ZONE,
});

/** Calendar day in the display time zone, as a comparable YYYY-MM-DD string. */
function localDayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TIME_ZONE,
  }).format(date);
}

export function formatLastLogin(lastLoginAt: Date | string | null | undefined, now: Date = new Date()): string {
  if (!lastLoginAt) return "Never";
  const date = lastLoginAt instanceof Date ? lastLoginAt : new Date(lastLoginAt);
  if (Number.isNaN(date.getTime())) return "Never";

  const today = localDayKey(now);
  const yesterday = localDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const day = localDayKey(date);

  if (day === today) return `Today ${timeFormat.format(date)}`;
  if (day === yesterday) return `Yesterday ${timeFormat.format(date)}`;
  return dateFormat.format(date);
}
