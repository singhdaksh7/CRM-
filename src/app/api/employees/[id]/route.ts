import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { employeeSchema } from "@/lib/validators";
import { getOrganizationId } from "@/lib/organization";
import { invalidateCache } from "@/lib/cache";

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
    const organizationId = getOrganizationId(session.user.id);
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
    const organizationId = getOrganizationId(session.user.id);
    const existing = await prisma.user.findFirst({ where: { id, organizationId } });
    if (!existing) throw new ApiError(404, "Employee not found");

    const body = await req.json();
    const { serviceAreas, ...data } = employeeSchema.partial().parse(body);
    if (existing.status === "PENDING_SETUP" && data.status === "ACTIVE") {
      throw new ApiError(409, "Complete account setup before activating this employee");
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
