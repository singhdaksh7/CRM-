import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { employeeSchema } from "@/lib/validators";
import { getOrganizationId } from "@/lib/organization";
import { invalidateCache } from "@/lib/cache";
import { deleteEmployeeAccount } from "@/lib/account-lifecycle";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

// Never include passwordHash in an API response.
const EMPLOYEE_DETAIL_SELECT = {
  id: true, organizationId: true, name: true, email: true, phone: true, role: true, status: true, notes: true,
  maxActiveLeads: true, isAvailable: true, speciality: true, autoAssignEnabled: true,
  createdAt: true, updatedAt: true,
  assignedLeads: { orderBy: { createdAt: "desc" as const } },
  assignedVisits: { include: { property: true, lead: true }, orderBy: { visitDate: "desc" as const } },
  followUps: { include: { lead: true, crmOwner: true }, orderBy: { dueDate: "asc" as const } },
  serviceAreas: { orderBy: { priority: "desc" as const } },
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN"]);
    const { id } = await params;
    const organizationId = getOrganizationId(session.user);
    const employee = await prisma.user.findFirst({
      where: { id, organizationId },
      select: EMPLOYEE_DETAIL_SELECT,
    });
    if (!employee) throw new ApiError(404, "Employee not found");
    return NextResponse.json({ employee });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN"]);
    const { id } = await params;
    const organizationId = getOrganizationId(session.user);
    const existing = await prisma.user.findFirst({ where: { id, organizationId } });
    if (!existing) throw new ApiError(404, "Employee not found");

    const body = await req.json();
    const { serviceAreas, status, ...data } = employeeSchema.partial().parse(body);
    // Account status is no longer a plain field update. Disabling has to
    // revoke live sessions (authVersion) and destroy outstanding setup/reset
    // links, and enabling has to choose between ACTIVE and PENDING_SETUP -
    // none of which a generic profile PATCH should do as a side effect. A
    // status change routed through here would silently skip all of that, so
    // it is rejected outright rather than partially honoured.
    if (status !== undefined && status !== existing.status) {
      throw new ApiError(400, "Use the account status controls to enable or disable an employee");
    }

    // Same lockout hazard as disableEmployeeAccount (account-lifecycle.ts):
    // demoting the last remaining active admin away from ADMIN is just as
    // dangerous as disabling them - nobody would be left who can promote
    // anyone back.
    if (data.role !== undefined && data.role !== "ADMIN" && existing.role === "ADMIN" && existing.status === "ACTIVE") {
      const otherActiveAdmins = await prisma.user.count({
        where: { organizationId, role: "ADMIN", status: "ACTIVE", id: { not: existing.id } },
      });
      if (otherActiveAdmins === 0) {
        throw new ApiError(400, "Cannot change the role of the only active admin in this organization");
      }
    }

    const employee = await prisma.user.update({
      where: { id },
      data: { ...data, email: data.email?.toLowerCase() },
      select: EMPLOYEE_DETAIL_SELECT,
    });

    if (serviceAreas) {
      await prisma.employeeServiceArea.deleteMany({ where: { employeeId: id } });
      if (serviceAreas.length > 0) {
        await prisma.employeeServiceArea.createMany({
          data: serviceAreas.map((locality, i) => ({ organizationId, employeeId: id, locality, priority: serviceAreas.length - i })),
        });
      }
    }

    await invalidateCache(`employees:list:${organizationId}`);
    return NextResponse.json({ employee });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * Permanently deletes an already-deactivated employee - only when they have
 * zero CRM history attached (see deleteEmployeeAccount in account-lifecycle.ts
 * for the full relation check and lockout guards). Deliberately ADMIN-only
 * and rate limited the same as the other account-admin actions.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN"]);
    const limit = await checkRateLimit("accountAdminAction", session.user.id);
    if (!limit.allowed) return rateLimitResponse(limit);

    const { id } = await params;
    const organizationId = getOrganizationId(session.user);
    const result = await deleteEmployeeAccount({ employeeId: id, organizationId, actorId: session.user.id });

    await invalidateCache(`employees:list:${organizationId}`);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
