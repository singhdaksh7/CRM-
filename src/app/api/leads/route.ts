import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { leadSchema } from "@/lib/validators";
import { generateCode } from "@/lib/utils";
import { logActivity } from "@/lib/activity";
import { getOrganizationId } from "@/lib/organization";
import { autoAssignLead } from "@/lib/assignment";
import { recalculateLeadScore } from "@/lib/scoring";
import { runMatchingForLead } from "@/lib/lead-matching";
import { notifyRoles } from "@/lib/notifications";
import { normalizeIndianPhone } from "@/integrations/whatsapp";
import { logger } from "@/lib/logger";
import { runAutomationRules } from "@/lib/automation-rules";
import { readTake, readSkip } from "@/lib/pagination";
import { assignedToSelect } from "@/lib/user-select";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const sp = req.nextUrl.searchParams;
    const where: Record<string, unknown> = { organizationId: getOrganizationId(session.user) };

    const q = sp.get("q");
    if (q) {
      where.OR = [{ clientName: { contains: q } }, { phone: { contains: q } }, { leadCode: { contains: q } }];
    }
    const source = sp.get("source");
    if (source) where.source = source;
    const status = sp.get("status");
    if (status) where.status = status;
    const priority = sp.get("priority");
    if (priority) where.priority = priority;
    const assignedToId = sp.get("assignedToId");
    if (assignedToId) where.assignedToId = assignedToId === "unassigned" ? null : assignedToId;

    // FIELD_EXECUTIVE scoping is enforced LAST and always wins over the
    // assignedToId query param above - a field executive may only ever see
    // (a) leads assigned to themself, or (b) org-wide unassigned leads (the
    // "My Assigned" / "Unassigned" tabs, spec item 12). Previously the query
    // param was applied after this check and could overwrite it, letting a
    // field executive pass ?assignedToId=<anotherUserId> to view a colleague's
    // assigned leads - fixed by applying the restriction last and clamping,
    // never trusting the client-supplied assignedToId for this role.
    if (session.user.role === "FIELD_EXECUTIVE") {
      where.assignedToId = assignedToId === "unassigned" ? null : session.user.id;
    }

    const location = sp.get("location");
    if (location) where.preferredLocation = location;
    const requirementType = sp.get("requirementType");
    if (requirementType) where.requirementType = requirementType;
    const assetClass = sp.get("assetClass");
    if (assetClass) where.assetClass = assetClass;
    const transactionType = sp.get("transactionType");
    if (transactionType) where.transactionType = transactionType;

    // Bounded (see src/lib/pagination.ts) - previously an unbounded findMany()
    // that returned every lead row in the org, with the full assignedTo User
    // row (including passwordHash) attached to each one.
    const take = readTake(sp);
    const skip = readSkip(sp);
    const leads = await prisma.lead.findMany({
      where,
      include: { assignedTo: { select: assignedToSelect } },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    });
    return NextResponse.json({ leads });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const body = await req.json();
    const data = leadSchema.parse(body);
    const organizationId = getOrganizationId(session.user);
    const count = await prisma.lead.count({ where: { organizationId } });

    // Non-blocking duplicate check: webhook leads already hard-block on
    // externalLeadId uniqueness, but manual creation has no such key, so we
    // only warn - the same phone number can legitimately recur (e.g. a
    // family member enquiring separately) and brokers should decide.
    let duplicateWarning: { leadId: string; clientName: string } | null = null;
    const normalizedPhone = normalizeIndianPhone(data.phone);
    if (normalizedPhone) {
      const last10 = normalizedPhone.slice(-10);
      const duplicate = await prisma.lead.findFirst({
        where: { organizationId, phone: { contains: last10 } },
        select: { id: true, clientName: true },
      });
      if (duplicate) duplicateWarning = { leadId: duplicate.id, clientName: duplicate.clientName };
    }

    const lead = await prisma.lead.create({
      data: {
        ...data,
        organizationId,
        email: data.email || null,
        leadCode: generateCode("LEAD", count + 1),
        moveInDate: data.moveInDate ? new Date(data.moveInDate) : null,
        transactionType: data.transactionType ?? (data.requirementType === "RENT" ? "RENT" : "SALE"),
        suitableForTags: JSON.stringify(data.suitableForTags),
      },
    });

    await logActivity({ leadId: lead.id, type: "LEAD_CREATED", description: `Lead manually created by ${session.user.name}`, actorId: session.user.id });

    if (lead.assignedToId) {
      await logActivity({ leadId: lead.id, type: "LEAD_ASSIGNED", description: "Assigned during creation", actorId: session.user.id });
    } else {
      await autoAssignLead(lead.id, organizationId);
    }

    await recalculateLeadScore(lead.id, "LEAD_CREATED");

    try {
      await runMatchingForLead(lead.id, "created");
    } catch (err) {
      logger.error("lead_matching_failed", { leadId: lead.id, message: err instanceof Error ? err.message : String(err) });
    }

    await runAutomationRules({ trigger: "LEAD_CREATED", leadId: lead.id, organizationId });

    await notifyRoles(["ADMIN", "DATA_MANAGER"], {
      organizationId,
      type: "NEW_LEAD",
      title: "New lead received",
      message: `${lead.clientName} - ${lead.preferredLocation} (${data.source.replace(/_/g, " ")})`,
      leadId: lead.id,
    });

    const finalLead = await prisma.lead.findUnique({ where: { id: lead.id }, include: { assignedTo: { select: assignedToSelect } } });
    return NextResponse.json({ lead: finalLead, duplicateWarning }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
