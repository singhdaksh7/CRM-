import { prisma } from "./prisma";

/**
 * Change 9 - unified Property Issues Queue. Merges open
 * PropertyAvailabilityReport and PropertyReport rows into one list. Shared
 * by GET /api/admin/property-issues and the /admin/property-issues page so
 * the merge logic exists in exactly one place.
 */
export async function getPropertyIssues(organizationId: string) {
  const [availabilityReports, propertyReports] = await Promise.all([
    prisma.propertyAvailabilityReport.findMany({
      where: { organizationId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: { property: { select: { id: true, title: true, area: true, propertyCode: true } }, reportedBy: { select: { id: true, name: true } } },
    }),
    prisma.propertyReport.findMany({
      where: { organizationId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: { property: { select: { id: true, title: true, area: true, propertyCode: true } }, reportedBy: { select: { id: true, name: true } } },
    }),
  ]);

  const issues = [
    ...availabilityReports.map((r) => ({
      id: r.id,
      issueType: "AVAILABILITY" as const,
      label: r.reason as string,
      note: r.note,
      property: r.property,
      reportedBy: r.reportedBy,
      createdAt: r.createdAt,
    })),
    ...propertyReports.map((r) => ({
      id: r.id,
      issueType: "REPORT" as const,
      label: r.type as string,
      note: r.note,
      property: r.property,
      reportedBy: r.reportedBy,
      createdAt: r.createdAt,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return issues;
}
