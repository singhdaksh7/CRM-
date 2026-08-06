import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { automationRuleSchema } from "@/lib/validators";
import { updateAutomationRule, deleteAutomationRule } from "@/lib/automation-rules";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(["ADMIN"]);
    const { id } = await params;
    const body = await req.json();
    const data = automationRuleSchema.partial().parse(body);
    const rule = await updateAutomationRule(id, data);
    return NextResponse.json({ rule });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(["ADMIN"]);
    const { id } = await params;
    const existing = await prisma.automationRule.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Rule not found");
    await deleteAutomationRule(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
