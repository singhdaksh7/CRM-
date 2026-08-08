import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { errorsToCsv, type ImportFieldIssue } from "@/lib/inventory-import-core";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]); const organizationId = getOrganizationId(session.user.id); const { id } = await params;
    const job = await prisma.importJob.findFirst({ where: { id, organizationId }, include: { records: { where: { status: { in: ["INVALID", "FAILED"] } } } } });
    if (!job) throw new ApiError(404, "Import job not found");
    const rows = job.records.map((record) => ({ rowNumber: record.rowNumber, issues: record.validationErrors ? JSON.parse(record.validationErrors) as ImportFieldIssue[] : [{ field: "row", message: record.errorMessage ?? "Import failed", severity: "ERROR" as const }] }));
    return new NextResponse(errorsToCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${id}-errors.csv"`, "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return handleApiError(error); }
}
