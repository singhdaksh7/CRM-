import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { recordAudit } from "@/lib/audit";
import { z } from "zod";

const createBackupSchema = z.object({
  type: z.enum(["FULL", "INCREMENTAL"]).default("FULL"),
});

export async function GET() {
  try {
    const session = await requireSession(["ADMIN"]);
    const organizationId = getOrganizationId(session.user);
    const backups = await prisma.backupRecord.findMany({
      where: { organizationId },
      include: { triggeredBy: { select: { id: true, name: true } }, restoreValidations: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ backups });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * Foundation only, per product scope: records a backup *intent* as metadata
 * history. No actual database dump/export runs here - wiring a real backup
 * job (e.g. a scheduled pg_dump/cron -> object storage) is a follow-up that
 * needs its own infra decision, not something to fake behind this endpoint.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession(["ADMIN"]);
    const organizationId = getOrganizationId(session.user);
    const { type } = createBackupSchema.parse(await req.json().catch(() => ({})));

    const backup = await prisma.backupRecord.create({
      data: { organizationId, type, status: "PENDING", triggeredById: session.user.id },
    });

    await recordAudit({ userId: session.user.id, action: "OTHER", entityType: "BackupRecord", entityId: backup.id, newValues: { type } });

    return NextResponse.json({ backup }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
