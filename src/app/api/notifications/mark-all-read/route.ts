import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { notificationVisibilityWhere } from "@/lib/notifications";
import { getOrganizationId } from "@/lib/organization";

export async function POST() {
  try {
    const session = await requireSession();
    const organizationId = getOrganizationId(session.user);
    const result = await prisma.notification.updateMany({
      // organizationId is required alongside notificationVisibilityWhere -
      // its role-broadcast branch (userId: null, role match) is role-scoped
      // only, so without this predicate this would mark every org's
      // role-broadcast notifications as read for anyone sharing that role.
      where: { organizationId, ...notificationVisibilityWhere(session.user.id, session.user.role), isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return NextResponse.json({ updated: result.count });
  } catch (err) {
    return handleApiError(err);
  }
}
