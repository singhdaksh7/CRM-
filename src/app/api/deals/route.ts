import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { dealSchema } from "@/lib/validators";
import { getOrganizationId } from "@/lib/organization";
import { isRestrictedToOwnRecords } from "@/lib/permissions";
import { generateDealCode, recordDealActivity, assertDealLinksBelongToOrg } from "@/lib/deals";
import { recordAudit } from "@/lib/audit";
import { readTake, readSkip } from "@/lib/pagination";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const organizationId = getOrganizationId(session.user.id);
    const sp = req.nextUrl.searchParams;
    const where: Record<string, unknown> = { organizationId };

    if (isRestrictedToOwnRecords(session.user.role)) where.assignedToId = session.user.id;

    const stage = sp.get("stage");
    if (stage) where.stage = stage;
    const status = sp.get("status");
    if (status) where.status = status;
    const dealType = sp.get("dealType");
    if (dealType) where.dealType = dealType;
    const ownerId = sp.get("ownerId");
    if (ownerId) where.ownerId = ownerId;
    const leadId = sp.get("leadId");
    if (leadId) where.leadId = leadId;
    const assignedToId = sp.get("assignedToId");
    if (assignedToId) where.assignedToId = assignedToId;
    const q = sp.get("q");
    if (q) where.dealCode = { contains: q };

    const take = readTake(sp);
    const skip = readSkip(sp);
    const [deals, total] = await Promise.all([
      prisma.deal.findMany({
        where,
        include: {
          lead: { select: { id: true, clientName: true, leadCode: true } },
          property: { select: { id: true, title: true, propertyCode: true } },
          owner: { select: { id: true, name: true, ownerCode: true } },
          assignedTo: { select: { id: true, name: true } },
          _count: { select: { payments: true, documents: true } },
        },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.deal.count({ where }),
    ]);
    return NextResponse.json({ deals, total, take, skip });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const body = await req.json();
    const data = dealSchema.parse(body);
    const organizationId = getOrganizationId(session.user.id);
    await assertDealLinksBelongToOrg(organizationId, data);
    const dealCode = await generateDealCode(organizationId);

    const deal = await prisma.deal.create({
      data: {
        organizationId,
        dealCode,
        dealType: data.dealType,
        stage: data.stage,
        status: data.status,
        leadId: data.leadId,
        propertyId: data.propertyId,
        ownerId: data.ownerId,
        agreedAmount: data.agreedAmount,
        brokeragePct: data.brokeragePct,
        brokerageAmount: data.brokerageAmount,
        assignedToId: data.assignedToId ?? session.user.id,
        expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : null,
        notes: data.notes,
        createdById: session.user.id,
      },
    });

    await recordDealActivity({
      dealId: deal.id,
      type: "DEAL_CREATED",
      description: `Deal ${deal.dealCode} created`,
      actorId: session.user.id,
    });
    await recordAudit({ userId: session.user.id, action: "CREATE", entityType: "Deal", entityId: deal.id, newValues: data });

    return NextResponse.json({ deal }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
