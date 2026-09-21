import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { getSystemConfig, updateSystemConfig } from "@/lib/system-config";
import { recordAudit } from "@/lib/audit";

const employeeDirectoryLabelSchema = z.object({
  employeeDirectoryLabel: z.string().trim().min(1, "Employee directory name cannot be empty").max(40, "Employee directory name must be 40 characters or fewer"),
});

export async function GET() {
  try {
    const session = await requireSession();
    const { employeeDirectoryLabel } = await getSystemConfig(getOrganizationId(session.user));
    return NextResponse.json({ employeeDirectoryLabel });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireSession(["ADMIN"]);
    const { employeeDirectoryLabel } = employeeDirectoryLabelSchema.parse(await request.json());
    const organizationId = getOrganizationId(session.user);
    const config = await updateSystemConfig({
      organizationId,
      updatedById: session.user.id,
      patch: { employeeDirectoryLabel },
    });
    await recordAudit({
      userId: session.user.id,
      organizationId,
      action: "UPDATE",
      entityType: "SystemConfig",
      newValues: { employeeDirectoryLabel },
    });
    return NextResponse.json({ employeeDirectoryLabel: config.employeeDirectoryLabel });
  } catch (error) {
    return handleApiError(error);
  }
}
