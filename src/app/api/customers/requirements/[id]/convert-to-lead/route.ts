import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { recordAudit } from "@/lib/audit";
import { autoAssignLead } from "@/lib/assignment";
import { logger } from "@/lib/logger";

// POST /api/customers/requirements/[id]/convert-to-lead - [Create Lead from
// Requirement] (rule 4). Copies the requirement into a new Lead, links both
// directions (Lead.customerContactId, CustomerRequirement.convertedLeadId),
// and never duplicates the person or the requirement's history. Idempotent:
// a requirement already converted returns its existing Lead instead of
// creating a second one (rule 4 "prevent duplicate Lead creation").
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const organizationId = getOrganizationId(session.user);
    const { id } = await params;
    const requirement = await prisma.customerRequirement.findFirst({
      where: { id, organizationId },
      include: { customerContact: true },
    });
    if (!requirement) throw new ApiError(404, "Requirement not found");

    if (requirement.convertedLeadId) {
      const lead = await prisma.lead.findUnique({ where: { id: requirement.convertedLeadId } });
      return NextResponse.json({ lead, alreadyConverted: true });
    }

    const contact = requirement.customerContact;
    const preferredLocalities: string[] = JSON.parse(requirement.preferredLocalities || "[]");
    const lead = await prisma.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: {
          organizationId,
          leadCode: `LEAD-DP-${Date.now()}`,
          clientName: contact.name,
          phone: contact.phone,
          email: contact.email,
          source: contact.source,
          assetClass: requirement.assetClass,
          transactionType: requirement.transactionType,
          requirementType: requirement.transactionType === "SALE" ? "BUY" : "RENT",
          preferredLocation: preferredLocalities[0] ?? "",
          minBudget: requirement.minBudget ?? 0,
          maxBudget: requirement.maxBudget ?? 0,
          preferredBhk: requirement.bhk,
          furnishingPref: requirement.furnishing,
          commercialPropertyType: requirement.commercialPropertyType,
          minAreaSqft: requirement.minArea,
          maxAreaSqft: requirement.maxArea,
          floorPreference: requirement.floorPreference,
          commercialFitOutPref: requirement.commercialFitOutPref,
          parkingRequired: requirement.parkingRequired,
          liftRequired: requirement.liftRequired,
          notes: requirement.notes,
          customerContactId: contact.id,
        },
      });
      await tx.customerRequirement.update({ where: { id: requirement.id }, data: { convertedLeadId: created.id } });
      return created;
    });

    await recordAudit({ userId: session.user.id, action: "CREATE", entityType: "Lead", entityId: lead.id, newValues: { fromRequirementId: requirement.id, customerContactId: contact.id } });

    // A6 - consistent assignment: a Demand Pool conversion is a genuinely
    // new Lead, so it enters the SAME assignment orchestration a manually
    // created lead does (POST /api/leads) rather than being left unassigned
    // by omission. Best-effort - the lead is already created and committed;
    // an assignment failure must not fail this request.
    try {
      await autoAssignLead(lead.id, organizationId);
    } catch (err) {
      logger.error("demand_pool_lead_auto_assign_failed", { leadId: lead.id, message: err instanceof Error ? err.message : String(err) });
    }

    return NextResponse.json({ lead, alreadyConverted: false }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
