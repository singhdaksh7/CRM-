import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { automationRuleSchema } from "@/lib/validators";
import { listAutomationRules, createAutomationRule } from "@/lib/automation-rules";
import { getOrganizationId } from "@/lib/organization";

export async function GET() {
  try {
    const session = await requireSession(["ADMIN"]);
    const rules = await listAutomationRules(getOrganizationId(session.user));
    return NextResponse.json({ rules });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN"]);
    const body = await req.json();
    const data = automationRuleSchema.parse(body);
    const rule = await createAutomationRule({ ...data, createdById: session.user.id, organizationId: getOrganizationId(session.user) });
    return NextResponse.json({ rule }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
