import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getOrganizationId } from "@/lib/organization";
import { recordAudit } from "@/lib/audit";

const MAX_EXPORT_ROWS = 500;

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const organizationId = getOrganizationId(session.user.id);
    const idsParam = req.nextUrl.searchParams.get("ids");
    const ids = idsParam ? idsParam.split(",").filter(Boolean) : undefined;

    const leads = await prisma.lead.findMany({
      where: {
        organizationId,
        ...(ids ? { id: { in: ids } } : {}),
        ...(session.user.role === "FIELD_EXECUTIVE" ? { assignedToId: session.user.id } : {}),
      },
      include: { assignedTo: { select: { name: true } } },
      take: MAX_EXPORT_ROWS,
      orderBy: { createdAt: "desc" },
    });

    const header = ["Lead Code", "Client Name", "Phone", "Status", "Priority", "Requirement", "Locality", "Min Budget", "Max Budget", "Assigned To", "Created At"];
    const rows = leads.map((l) => [
      l.leadCode,
      l.clientName,
      l.phone,
      l.status,
      l.priority,
      l.requirementType,
      l.preferredLocation,
      l.minBudget,
      l.maxBudget,
      l.assignedTo?.name ?? "Unassigned",
      l.createdAt.toISOString(),
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");

    await recordAudit({ userId: session.user.id, action: "EXPORT", entityType: "Lead", newValues: { count: leads.length } });

    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="leads-export-${Date.now()}.csv"` },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
