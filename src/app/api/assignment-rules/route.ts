import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { assignmentRuleSchema } from "@/lib/validators";
import { getOrganizationId } from "@/lib/organization";

export async function GET() {
  try {
    const session = await requireSession(["ADMIN"]);
    const rules = await prisma.leadAssignmentRule.findMany({
      where: { organizationId: getOrganizationId(session.user) },
      include: { employee: true },
      orderBy: { priority: "desc" },
    });
    return NextResponse.json({ rules });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN"]);
    const body = await req.json();
    const data = assignmentRuleSchema.parse(body);
    const rule = await prisma.leadAssignmentRule.create({
      data: { ...data, organizationId: getOrganizationId(session.user) },
    });
    return NextResponse.json({ rule }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
