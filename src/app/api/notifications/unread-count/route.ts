import { NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getUnreadCount } from "@/lib/notifications";
import { withTiming } from "@/lib/perf";

/**
 * Lightweight polling target for the header bell - just the count, no
 * notification list, and (unlike GET /api/notifications) no sweep
 * trigger. Client polls this every 30-60s and on window focus instead of
 * the layout blocking every navigation on it (see (app)/layout.tsx).
 */
export async function GET() {
  const route = "/api/notifications/unread-count";
  try {
    const session = await withTiming("auth", route, () => requireSession());
    const unreadCount = await withTiming("getUnreadCount", route, () => getUnreadCount(session.user.id, session.user.role));
    return NextResponse.json({ unreadCount });
  } catch (err) {
    return handleApiError(err);
  }
}
