import { auth } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard-data";
import { KpiCard } from "@/components/ui/kpi-card";
import { BarChartCard, PieChartCard, TrendChartCard } from "@/components/dashboard/charts";
import { Badge, LEAD_STATUS_TONE } from "@/components/ui/badge";
import { timeAgo, enumToLabel } from "@/lib/utils";
import { Building2, Home, Landmark, Users, UserX, BellRing, CalendarClock, Trophy, ArrowRight } from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) return null;
  const data = await getDashboardData(session.user.role, session.user.id);
  const firstName = session.user.name.split(" ")[0];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[rgba(255,255,255,0.08)] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#F8FAFC]">
            Welcome back, {firstName} Bhaiya 👋
          </h1>
          <p className="mt-1 text-sm text-[#94A3B8]">
            Here is what&apos;s happening with your NCR property portfolio & leads today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/leads?add=true"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#4F8CFF] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#6BA0FF] transition-colors"
          >
            + Add Lead
          </Link>
          <Link
            href="/properties?add=true"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E2533] border border-[rgba(255,255,255,0.08)] px-3.5 py-2 text-xs font-semibold text-[#F8FAFC] hover:bg-[#252D3D] transition-colors"
          >
            + Add Property
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <KpiCard label="Active Properties" value={data.totalActiveProperties} icon={Building2} tone="blue" />
        <KpiCard label="For Rent" value={data.propertiesForRent} icon={Home} tone="indigo" />
        <KpiCard label="For Sale" value={data.propertiesForSale} icon={Landmark} tone="purple" />
        <KpiCard label="New Leads Today" value={data.newLeadsToday} icon={Users} tone="green" />
        <KpiCard label="Unassigned Leads" value={data.unassignedLeads} icon={UserX} tone="amber" />
        <KpiCard label="Follow-ups Due Today" value={data.followUpsDueToday} icon={BellRing} tone="red" />
        <KpiCard label="Visits Today" value={data.visitsToday} icon={CalendarClock} tone="blue" />
        <KpiCard label="Deals Closed (Month)" value={data.dealsClosedThisMonth} icon={Trophy} tone="green" />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PieChartCard title="Leads by Source" data={data.leadsBySource} />
        <PieChartCard title="Leads by Status" data={data.leadsByStatus} />
        <BarChartCard title="Properties by Location" data={data.propertiesByLocation} />
        <BarChartCard title="Employee-wise Active Leads" data={data.employeeLeadCounts.map((e) => ({ name: e.name, value: e.count }))} />
      </div>

      <TrendChartCard title="Monthly Lead & Deal Trends" data={data.monthlyTrend} />

      {/* Recent Activity Panel */}
      <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-[#F8FAFC]">Recent Lead Activity</h3>
            <p className="text-xs text-[#94A3B8]">Latest interactions, follow-ups & stage updates</p>
          </div>
          <Link href="/leads" className="inline-flex items-center gap-1 text-xs font-semibold text-[#4F8CFF] hover:text-[#6BA0FF]">
            View all leads <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="space-y-3">
          {data.recentActivities.length === 0 && <p className="text-sm text-[#64748B]">No recent activity recorded yet.</p>}
          {data.recentActivities.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-3 border-b border-[rgba(255,255,255,0.06)] pb-3 last:border-0 last:pb-0">
              <div>
                <p className="text-sm text-[#CBD5E1]">
                  <Link href={`/leads/${a.leadId}`} className="font-semibold text-[#F8FAFC] hover:text-[#4F8CFF] transition-colors">
                    {a.lead!.clientName}
                  </Link>{" "}
                  &middot; {a.description}
                </p>
                <p className="mt-0.5 text-xs text-[#64748B]">{a.actor ? `${a.actor.name} · ` : ""}{timeAgo(a.createdAt)}</p>
              </div>
              <Badge tone={LEAD_STATUS_TONE[a.lead!.status] ?? "slate"}>{enumToLabel(a.lead!.status)}</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
