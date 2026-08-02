import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";

const MAX_PAGE_SIZE = 100;

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN"]);
    const organizationId = getOrganizationId(session.user.id);
    const sp = req.nextUrl.searchParams;
    const where: Record<string, unknown> = { organizationId };

    const entityType = sp.get("entityType");
    if (entityType) where.entityType = entityType;
    const entityId = sp.get("entityId");
    if (entityId) where.entityId = entityId;
    const userId = sp.get("userId");
    if (userId) where.userId = userId;
    const action = sp.get("action");
    if (action) where.action = action;
    const result = sp.get("result");
    if (result) where.result = result;

    const take = Math.min(Number(sp.get("take") ?? 50) || 50, MAX_PAGE_SIZE);
    const cursor = sp.get("cursor");

    const logs = await prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    const nextCursor = logs.length === take ? logs[logs.length - 1].id : null;
    return NextResponse.json({ logs, nextCursor });
  } catch (err) {
    return handleApiError(err);
  }
}
