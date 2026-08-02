import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { notificationVisibilityWhere } from "@/lib/notifications";
import { getOrganizationId } from "@/lib/organization";

// The due/overdue follow-up sweep previously ran synchronously on every call
// to this endpoint (it backs the header bell dropdown). It's now handled by
// Vercel Cron + a throttled lazy fallback - see
// src/app/api/internal/notifications/sweep/route.ts and (app)/layout.tsx -
// so this endpoint only ever reads.
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const organizationId = getOrganizationId(session.user.id);

    const sp = req.nextUrl.searchParams;
    const type = sp.get("type");
    const unreadOnly = sp.get("unreadOnly") === "true";

    const notifications = await prisma.notification.findMany({
      where: {
        organizationId,
        ...notificationVisibilityWhere(session.user.id, session.user.role),
        ...(type ? { type: type as never } : {}),
        ...(unreadOnly ? { isRead: false } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const unreadCount = await prisma.notification.count({
      where: { organizationId, ...notificationVisibilityWhere(session.user.id, session.user.role), isRead: false },
    });

    return NextResponse.json({ notifications, unreadCount });
  } catch (err) {
    return handleApiError(err);
  }
}
