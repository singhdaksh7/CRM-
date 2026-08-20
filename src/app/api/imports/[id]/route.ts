import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(["ADMIN", "DATA_MANAGER"]);
    const { id } = await params;
    const organizationId = getOrganizationId(session.user);
    const job = await prisma.importJob.findFirst({
      where: { id, organizationId },
      include: { records: { orderBy: { rowNumber: "asc" } }, createdBy: { select: { id: true, name: true } } },
    });
    if (!job) throw new ApiError(404, "Import job not found");
    return NextResponse.json({ job });
  } catch (err) {
    return handleApiError(err);
  }
}
