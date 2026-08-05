import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getSystemConfig, updateSystemConfig } from "@/lib/system-config";
import { recordAudit } from "@/lib/audit";

export async function GET() {
  try {
    await requireSession(["ADMIN"]);
    const config = await getSystemConfig();
    return NextResponse.json({ config });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN"]);
    const patch = await req.json();
    const config = await updateSystemConfig({ updatedById: session.user.id, patch });
    await recordAudit({ userId: session.user.id, action: "UPDATE", entityType: "SystemConfig", newValues: patch });
    return NextResponse.json({ config });
  } catch (err) {
    return handleApiError(err);
  }
}
