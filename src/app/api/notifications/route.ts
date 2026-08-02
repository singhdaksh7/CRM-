import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { notificationVisibilityWhere } from "@/lib/notifications";
import { generateDueFollowUpNotifications } from "@/lib/notifications";
import { getOrganizationId } from "@/lib/organization";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const organizationId = getOrganizationId(session.user.id);

    // Application-level "cron": generate any due/overdue follow-up
    // notifications lazily before returning the list (idempotent - see
    // lib/notifications.ts for why this is safe to run on every request).
    await generateDueFollowUpNotifications(organizationId);

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
