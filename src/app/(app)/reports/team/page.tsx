import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getOrganizationId } from "@/lib/organization";
import { prisma } from "@/lib/prisma";
import { ReportsTabs } from "@/components/dashboard/reports-tabs";
import { TeamReportFilters } from "@/components/reports/team-report-filters";
import { TeamReportView } from "@/components/reports/team-report-view";
import { EmptyState } from "@/components/ui/states";
import { resolveTeamReportDateRange, getTeamReportData } from "@/lib/team-reports-data";

export default async function TeamReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string; period?: string; from?: string; to?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // ACCESS: Restrict to ADMIN and DATA_MANAGER
  const canAccess = session.user.role === "ADMIN" || session.user.role === "DATA_MANAGER";
  if (!canAccess) {
    redirect("/reports");
  }

  const organizationId = getOrganizationId(session.user);
  const sp = await searchParams;

  // Fetch active team members (FIELD_EXECUTIVE, DATA_MANAGER, ADMIN)
  const members = await prisma.user.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      role: { in: ["FIELD_EXECUTIVE", "DATA_MANAGER", "ADMIN"] },
    },
    select: { id: true, name: true, role: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  const selectedUserId = sp.userId && members.some((m) => m.id === sp.userId)
    ? sp.userId
    : members[0]?.id ?? "";

  const range = resolveTeamReportDateRange({
    period: sp.period,
    from: sp.from,
    to: sp.to,
  });

  const reportData = selectedUserId
    ? await getTeamReportData({ organizationId, userId: selectedUserId, range })
    : null;

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E4E4E7] pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[#09090B]">Team Reports</h1>
        <p className="mt-1 text-xs text-[#71717A]">
          Individual activity, visit execution, property contributions, and follow-ups attribution
        </p>
      </div>

      <ReportsTabs />

      {members.length === 0 ? (
        <EmptyState title="No active team members" description="No active team members found in your organization." />
      ) : (
        <>
          <TeamReportFilters
            members={members}
            selectedUserId={selectedUserId}
            period={range.period}
            customFrom={sp.from}
            customTo={sp.to}
          />

          {reportData ? (
            <TeamReportView data={reportData} />
          ) : (
            <EmptyState title="No report data" description="Could not load report data for the selected team member." />
          )}
        </>
      )}
    </div>
  );
}
