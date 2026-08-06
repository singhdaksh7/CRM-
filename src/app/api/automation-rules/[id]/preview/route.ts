import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { previewAutomationRule } from "@/lib/automation-rules";

/** Read-only "Test rule" preview - zero writes, safe to call at any time, including for a currently-disabled rule. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession(["ADMIN"]);
    const { id } = await params;
    const preview = await previewAutomationRule(id);
    return NextResponse.json({ preview });
  } catch (err) {
    return handleApiError(err);
  }
}
