import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getExecutiveDashboardData } from "@/lib/executive-dashboard-data";
import { VisitSection, RecentlyReportedSection, AssignedLeadsSection, AssignedCataloguesSection, PropertyMiniGrid } from "@/components/executive-dashboard/dashboard-sections";

export default async function ExecutiveDashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const sp = await searchParams;
  const targetUserId = sp.employeeId && session.user.role !== "FIELD_EXECUTIVE" ? sp.employeeId : session.user.id;

  const data = await getExecutiveDashboardData(targetUserId);

  return (
    <div className="space-y-8 pb-6">
      <div className="border-b border-[#E7ECF2] pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[#1B2430]">
          {targetUserId === session.user.id ? "Today's Work" : "Executive Dashboard"}
        </h1>
        <p className="mt-1 text-sm text-[#596579]">Today&apos;s field work, at a glance.</p>
      </div>

      <VisitSection title="Today's Visits" visits={data.todaysVisits} emptyMessage="No visits scheduled today" />
      <VisitSection title="Upcoming Visits" visits={data.upcomingVisits} emptyMessage="Nothing upcoming yet" />
      <VisitSection title="Recently Completed" visits={data.recentlyCompleted} emptyMessage="No completed visits yet" />
      <RecentlyReportedSection items={data.recentlyReported} />
      <AssignedLeadsSection leads={data.assignedLeads} />
      <AssignedCataloguesSection catalogues={data.assignedCatalogues} />
      <PropertyMiniGrid title="Favorites" properties={data.favorites} />
      <PropertyMiniGrid title="Recently Viewed" properties={data.recentlyViewed} />
    </div>
  );
}
