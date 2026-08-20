import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { dealSchema } from "@/lib/validators";
import { getOrganizationId } from "@/lib/organization";
import { isRestrictedToOwnRecords } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { assertDealLinksBelongToOrg } from "@/lib/deals";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const organizationId = getOrganizationId(session.user);

    const deal = await prisma.deal.findFirst({
      where: { id, organizationId },
      include: {
        lead: true,
        property: true,
        owner: true,
        assignedTo: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        brokerageCalculations: { orderBy: { createdAt: "desc" } },
        payments: { orderBy: { createdAt: "desc" } },
        documents: { where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" } },
        activities: { orderBy: { createdAt: "desc" }, take: 50, include: { actor: { select: { id: true, name: true } } } },
      },
    });
    if (!deal) throw new ApiError(404, "Deal not found");
    if (isRestrictedToOwnRecords(session.user.role) && deal.assignedToId !== session.user.id) {
      throw new ApiError(403, "Forbidden");
    }

    const totalPaid = deal.payments.filter((p) => p.status === "PAID").reduce((sum, p) => sum + p.amount, 0);
    const outstandingBalance = Math.max((deal.brokerageAmount ?? 0) - totalPaid, 0);

    return NextResponse.json({ deal, totalPaid, outstandingBalance });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;
    const organizationId = getOrganizationId(session.user);
    const existing = await prisma.deal.findFirst({ where: { id, organizationId } });
    if (!existing) throw new ApiError(404, "Deal not found");

    const body = await req.json();
    const { expectedCloseDate, ...data } = dealSchema.partial().parse(body);
    await assertDealLinksBelongToOrg(organizationId, data);

    const deal = await prisma.deal.update({
      where: { id },
      data: {
        ...data,
        ...(expectedCloseDate !== undefined ? { expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null } : {}),
      },
    });

    await recordAudit({ userId: session.user.id, action: "UPDATE", entityType: "Deal", entityId: id, oldValues: existing, newValues: data });

    return NextResponse.json({ deal });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN"]);
    const { id } = await params;
    const organizationId = getOrganizationId(session.user);
    const existing = await prisma.deal.findFirst({ where: { id, organizationId } });
    if (!existing) throw new ApiError(404, "Deal not found");

    const deal = await prisma.deal.update({ where: { id }, data: { status: "CANCELLED" } });
    await recordAudit({ userId: session.user.id, action: "DELETE", entityType: "Deal", entityId: id, oldValues: existing });

    return NextResponse.json({ deal });
  } catch (err) {
    return handleApiError(err);
  }
}
