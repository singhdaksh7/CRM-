import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { employeeSchema } from "@/lib/validators";
import { getOrganizationId } from "@/lib/organization";
import { invalidateCache } from "@/lib/cache";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { buildAccountSetupUrl, createAccountSetupSecret } from "@/lib/account-setup";

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
      where: { organizationId: getOrganizationId(session.user) },
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
    const organizationId = getOrganizationId(session.user);

    const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (existing) throw new ApiError(409, "Email already in use");

    const secret = createAccountSetupSecret();
    // A random, undisclosed placeholder keeps the existing non-null column
    // compatible. PENDING_SETUP is rejected by Auth.js before bcrypt runs.
    const passwordHash = await bcrypt.hash(randomUUID(), 10);
    const employee = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: {
        organizationId,
        name: data.name,
        email: data.email.toLowerCase(),
        phone: data.phone,
        role: data.role,
        status: "PENDING_SETUP",
        notes: data.notes,
        passwordHash,
        maxActiveLeads: data.maxActiveLeads ?? 20,
        isAvailable: data.isAvailable ?? true,
        speciality: data.speciality ?? "ALL",
        autoAssignEnabled: data.autoAssignEnabled ?? true,
        serviceAreas: data.serviceAreas
          ? { create: data.serviceAreas.map((locality, i) => ({ organizationId, locality, priority: data.serviceAreas!.length - i })) }
          : undefined,
      }, select: EMPLOYEE_SELECT });
      await tx.accountSetupToken.create({ data: {
        organizationId,
        userId: created.id,
        tokenHash: secret.tokenHash,
        expiresAt: secret.expiresAt,
      } });
      await tx.auditLog.create({ data: {
        organizationId,
        userId: session.user.id,
        action: "CREATE",
        entityType: "User",
        entityId: created.id,
        newValues: JSON.stringify({ event: "employee_created_pending_setup", email: created.email, role: created.role }),
      } });
      return created;
    });
    await invalidateCache(`employees:list:${organizationId}`);
    return NextResponse.json({ employee, setupUrl: buildAccountSetupUrl(secret.token), expiresAt: secret.expiresAt }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
