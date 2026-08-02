import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { recordAudit } from "@/lib/audit";
import { z } from "zod";

const validateRestoreSchema = z.object({
  status: z.enum(["PENDING", "RUNNING", "COMPLETED", "FAILED"]),
  issuesFound: z.array(z.string()).optional(),
});

/** Records the outcome of a manual/offline restore-drill against a backup. No restore is executed by this endpoint. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN"]);
    const { id } = await params;
    const organizationId = getOrganizationId(session.user.id);
    const backup = await prisma.backupRecord.findFirst({ where: { id, organizationId } });
    if (!backup) throw new ApiError(404, "Backup record not found");

    const data = validateRestoreSchema.parse(await req.json());

    const validation = await prisma.restoreValidation.create({
      data: {
        organizationId,
        backupRecordId: id,
        status: data.status,
        validatedById: session.user.id,
        validatedAt: data.status === "COMPLETED" || data.status === "FAILED" ? new Date() : null,
        issuesFound: data.issuesFound ? JSON.stringify(data.issuesFound) : null,
      },
    });

    await recordAudit({ userId: session.user.id, action: "OTHER", entityType: "RestoreValidation", entityId: validation.id, newValues: data });

    return NextResponse.json({ validation }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
