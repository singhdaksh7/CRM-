import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { notificationVisibilityWhere } from "@/lib/notifications";

export async function POST() {
  try {
    const session = await requireSession();
    const result = await prisma.notification.updateMany({
      where: { ...notificationVisibilityWhere(session.user.id, session.user.role), isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return NextResponse.json({ updated: result.count });
  } catch (err) {
    return handleApiError(err);
  }
}
