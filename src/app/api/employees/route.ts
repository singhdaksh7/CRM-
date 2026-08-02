import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { employeeSchema } from "@/lib/validators";
import { getOrganizationId } from "@/lib/organization";
import bcrypt from "bcryptjs";

// Never include passwordHash in an API response - select every other User
// field explicitly instead of `include` (which would return the full row).
const EMPLOYEE_SELECT = {
  id: true, organizationId: true, name: true, email: true, phone: true, role: true, status: true, notes: true,
  maxActiveLeads: true, isAvailable: true, speciality: true, autoAssignEnabled: true,
  createdAt: true, updatedAt: true,
  _count: { select: { assignedLeads: true, assignedVisits: true } },
  serviceAreas: true,
} as const;

export async function GET() {
  try {
    const session = await requireSession();
    const employees = await prisma.user.findMany({
      where: { organizationId: getOrganizationId(session.user.id) },
      select: EMPLOYEE_SELECT,
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ employees });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN"]);
    const body = await req.json();
    const data = employeeSchema.parse(body);
    const organizationId = getOrganizationId(session.user.id);

    const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (existing) throw new ApiError(409, "Email already in use");

    const passwordHash = await bcrypt.hash(data.password ?? "Welcome@123", 10);
    const employee = await prisma.user.create({
      data: {
        organizationId,
        name: data.name,
        email: data.email.toLowerCase(),
        phone: data.phone,
        role: data.role,
        status: data.status,
        notes: data.notes,
        passwordHash,
        maxActiveLeads: data.maxActiveLeads ?? 20,
        isAvailable: data.isAvailable ?? true,
        speciality: data.speciality ?? "ALL",
        autoAssignEnabled: data.autoAssignEnabled ?? true,
        serviceAreas: data.serviceAreas
          ? { create: data.serviceAreas.map((locality, i) => ({ organizationId, locality, priority: data.serviceAreas!.length - i })) }
          : undefined,
      },
      select: EMPLOYEE_SELECT,
    });
    return NextResponse.json({ employee }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
