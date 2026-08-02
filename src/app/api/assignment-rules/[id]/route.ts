import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { assignmentRuleSchema } from "@/lib/validators";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(["ADMIN"]);
    const { id } = await params;
    const body = await req.json();
    const data = assignmentRuleSchema.partial().parse(body);
    const rule = await prisma.leadAssignmentRule.update({ where: { id }, data });
    return NextResponse.json({ rule });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(["ADMIN"]);
    const { id } = await params;
    const existing = await prisma.leadAssignmentRule.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Rule not found");
    await prisma.leadAssignmentRule.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
