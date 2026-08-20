import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { notificationVisibilityWhere } from "@/lib/notifications";
import { getOrganizationId } from "@/lib/organization";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const organizationId = getOrganizationId(session.user);
    const { id } = await params;
    const notification = await prisma.notification.findFirst({
      // organizationId is required alongside notificationVisibilityWhere -
      // its role-broadcast branch (userId: null, role match) is role-scoped
      // only, so without this predicate a user could mark another org's
      // role-broadcast notification as read by guessing/enumerating its id.
      where: { id, organizationId, ...notificationVisibilityWhere(session.user.id, session.user.role) },
    });
    if (!notification) throw new ApiError(404, "Notification not found");

    const updated = await prisma.notification.update({ where: { id }, data: { isRead: true, readAt: new Date() } });
    return NextResponse.json({ notification: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
