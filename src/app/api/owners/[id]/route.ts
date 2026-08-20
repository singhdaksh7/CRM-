import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { ownerSchema } from "@/lib/validators";
import { getOrganizationId } from "@/lib/organization";
import { computeOwnerAnalytics, recordOwnerActivity } from "@/lib/owners";
import { recordAudit } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const organizationId = getOrganizationId(session.user);

    const owner = await prisma.owner.findFirst({
      where: { id, organizationId },
      include: {
        properties: { orderBy: { createdAt: "desc" } },
        deals: { orderBy: { createdAt: "desc" }, include: { property: true } },
        documents: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" } },
        followUps: { orderBy: { dueDate: "asc" } },
        activities: { orderBy: { createdAt: "desc" }, take: 50, include: { actor: { select: { id: true, name: true } } } },
        verifiedBy: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!owner) throw new ApiError(404, "Owner not found");

    const analytics = await computeOwnerAnalytics(id);
    return NextResponse.json({ owner, analytics });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;
    const organizationId = getOrganizationId(session.user);
    const existing = await prisma.owner.findFirst({ where: { id, organizationId } });
    if (!existing) throw new ApiError(404, "Owner not found");

    const body = await req.json();
    const data = ownerSchema.partial().parse(body);

    const owner = await prisma.owner.update({
      where: { id },
      data: { ...data, email: data.email || undefined },
    });

    await recordOwnerActivity({
      ownerId: id,
      type: "OWNER_UPDATED",
      description: `Owner ${owner.name} details updated`,
      actorId: session.user.id,
    });
    await recordAudit({
      userId: session.user.id,
      action: "UPDATE",
      entityType: "Owner",
      entityId: id,
      oldValues: existing,
      newValues: data,
    });

    return NextResponse.json({ owner });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN"]);
    const { id } = await params;
    const organizationId = getOrganizationId(session.user);
    const existing = await prisma.owner.findFirst({
      where: { id, organizationId },
      include: { _count: { select: { properties: true, deals: true } } },
    });
    if (!existing) throw new ApiError(404, "Owner not found");
    if (existing._count.properties > 0 || existing._count.deals > 0) {
      throw new ApiError(409, "Cannot delete an owner linked to properties or deals - unlink them first");
    }

    await prisma.owner.delete({ where: { id } });
    await recordAudit({ userId: session.user.id, action: "DELETE", entityType: "Owner", entityId: id, oldValues: existing });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
