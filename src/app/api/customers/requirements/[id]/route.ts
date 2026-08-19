import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { customerRequirementBaseSchema } from "@/lib/validators";
import { getOrganizationId } from "@/lib/organization";
import { recordAudit } from "@/lib/audit";

// PATCH /api/customers/requirements/[id] - edit a requirement, or pass
// { confirm: true } to bump lastConfirmedAt (rule 44 [Mark Requirement
// Confirmed]) without editing any field. Never silently overwrites budget
// history without an explicit body - the caller decides what changed
// (rule 8: preserve meaningful history via the AuditLog before/after diff).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const organizationId = getOrganizationId(session.user.id);
    const { id } = await params;
    const existing = await prisma.customerRequirement.findFirst({ where: { id, organizationId } });
    if (!existing) throw new ApiError(404, "Requirement not found");

    const payload = await req.json();
    if (payload?.confirm === true) {
      const requirement = await prisma.customerRequirement.update({ where: { id }, data: { lastConfirmedAt: new Date() } });
      await recordAudit({ userId: session.user.id, action: "UPDATE", entityType: "CustomerRequirement", entityId: id, newValues: { lastConfirmedAt: requirement.lastConfirmedAt } });
      return NextResponse.json({ requirement });
    }

    const body = customerRequirementBaseSchema.partial().parse(payload);
    const data: Record<string, unknown> = { ...body };
    if (body.preferredLocalities) data.preferredLocalities = JSON.stringify(body.preferredLocalities);
    // Any substantive edit re-confirms the requirement - the broker just
    // updated it, so it is by definition current (rule 44).
    data.lastConfirmedAt = new Date();

    const requirement = await prisma.customerRequirement.update({ where: { id }, data });
    await recordAudit({
      userId: session.user.id,
      action: "UPDATE",
      entityType: "CustomerRequirement",
      entityId: id,
      oldValues: { minBudget: existing.minBudget, maxBudget: existing.maxBudget, active: existing.active },
      newValues: { minBudget: requirement.minBudget, maxBudget: requirement.maxBudget, active: requirement.active },
    });
    return NextResponse.json({ requirement });
  } catch (err) {
    return handleApiError(err);
  }
}
