import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { getDashboardCriticalData, getDashboardSecondaryData } from "@/lib/dashboard-data";
import { KpiCard } from "@/components/ui/kpi-card";
import { BarChartCard, PieChartCard, TrendChartCard } from "@/components/dashboard/charts";
import { LeadsAwaitingShortlistPanel } from "@/components/dashboard/leads-awaiting-shortlist-panel";
import { Badge, LEAD_STATUS_TONE } from "@/components/ui/badge";
import { timeAgo, enumToLabel } from "@/lib/utils";
import { Building2, Home, Landmark, Users, UserX, BellRing, CalendarClock, Trophy, ArrowRight, Send, Eye, Heart, CalendarPlus, ListChecks } from "lucide-react";
import type { Role } from "@prisma/client";
import Link from "next/link";
import { getActionCenterItems, getLeadHealthOverview, getPropertyHealthOverview } from "@/lib/rules";
import { getOrganizationId } from "@/lib/organization";
import { ActionCenterList } from "@/components/dashboard/action-center-list";
import { HealthOverviewCard } from "@/components/dashboard/health-overview-card";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) return null;
  const data = await getDashboardCriticalData(session.user.role, session.user.id);
  const firstName = session.user.name.split(" ")[0];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#E7ECF2] pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1B2430]">
            Welcome back, {firstName} Bhaiya 👋
          </h1>
          <p className="mt-1 text-sm text-[#596579]">
            Here is what&apos;s happening with your NCR property portfolio & leads today.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/leads?add=true"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#3366FF] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#2952CC] transition-colors shadow-xs"
          >
            + Add Lead
          </Link>
          <Link
            href="/properties?add=true"
            className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-[#E7ECF2] px-4 py-2.5 text-xs font-semibold text-[#1B2430] hover:bg-[#F3F6FA] transition-colors shadow-xs"
          >
            + Add Property
          </Link>
        </div>
      </div>

      {/* Stitch 1.0 Clean Dashboard Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <KpiCard label="Active Properties" value={data.totalActiveProperties} icon={Building2} tone="blue" />
        <KpiCard label="For Rent" value={data.propertiesForRent} icon={Home} tone="indigo" />
        <KpiCard label="For Sale" value={data.propertiesForSale} icon={Landmark} tone="purple" />
        <KpiCard label="New Leads Today" value={data.newLeadsToday} icon={Users} tone="green" />
        <KpiCard label="Unassigned Leads" value={data.unassignedLeads} icon={UserX} tone="amber" />
        <KpiCard label="Follow-ups Due Today" value={data.followUpsDueToday} icon={BellRing} tone="red" />
        <KpiCard label="Visits Today" value={data.visitsToday} icon={CalendarClock} tone="blue" />
        <KpiCard label="Deals Closed (Month)" value={data.dealsClosedThisMonth} icon={Trophy} tone="green" />
        <KpiCard label="Catalogues Sent Today" value={data.cataloguesSentToday} icon={Send} tone="indigo" />
        <KpiCard label="Catalogues Opened Today" value={data.cataloguesOpenedToday} icon={Eye} tone="blue" />
        <KpiCard label="Clients Interested Today" value={data.clientsInterestedToday} icon={Heart} tone="purple" />
        <KpiCard label="Visit Requests Today" value={data.visitRequestsReceivedToday} icon={CalendarPlus} tone="amber" />
        <KpiCard label="Awaiting Shortlist" value={data.leadsAwaitingShortlistCount} icon={ListChecks} tone="red" />
      </div>

      {/* Smart Action Center - Phase 1 deterministic rule engine */}
      <Suspense fallback={<PanelSkeleton />}>
        <SmartActionCenter role={session.user.role} userId={session.user.id} />
      </Suspense>

      {/* Lead & Property Health Overview */}
      <Suspense fallback={<div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><PanelSkeleton /><PanelSkeleton /></div>}>
        <HealthOverviewSection role={session.user.role} userId={session.user.id} />
      </Suspense>

      {/* Leads Streamed Panel */}
      <Suspense fallback={<PanelSkeleton />}>
        <LeadsAwaitingShortlistPanel userId={session.user.id} />
      </Suspense>

      {/* Charts and Activity Streamed Panel */}
      <Suspense fallback={<DashboardSecondarySkeleton />}>
        <DashboardSecondary role={session.user.role} userId={session.user.id} />
      </Suspense>
    </div>
  );
}

async function DashboardSecondary({ role, userId }: { role: Role; userId: string }) {
  const data = await getDashboardSecondaryData(role, userId);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PieChartCard title="Leads by Source" data={data.leadsBySource} />
        <PieChartCard title="Leads by Status" data={data.leadsByStatus} />
        <BarChartCard title="Properties by Location" data={data.propertiesByLocation} />
        <BarChartCard title="Employee-wise Active Leads" data={data.employeeLeadCounts.map((e) => ({ name: e.name, value: e.count }))} />
      </div>

      <TrendChartCard title="Monthly Lead & Deal Trends" data={data.monthlyTrend} />

      {/* Recent Activity Panel */}
      <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-[#1B2430]">Recent Lead Activity</h3>
            <p className="text-xs text-[#596579]">Latest interactions, follow-ups & stage updates</p>
          </div>
          <Link href="/leads" className="inline-flex items-center gap-1 text-xs font-semibold text-[#3366FF] hover:text-[#2952CC]">
            View all leads <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="space-y-3">
          {data.recentActivities.length === 0 && <p className="text-sm text-[#8A94A6]">No recent activity recorded yet.</p>}
          {data.recentActivities.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-3 border-b border-[#EFF4FF] pb-3 last:border-0 last:pb-0">
              <div>
                <p className="text-sm text-[#596579]">
                  <Link href={`/leads/${a.leadId}`} className="font-semibold text-[#1B2430] hover:text-[#3366FF] transition-colors">
                    {a.lead!.clientName}
                  </Link>{" "}
                  &middot; {a.description}
                </p>
                <p className="mt-0.5 text-xs text-[#8A94A6]">{a.actor ? `${a.actor.name} · ` : ""}{timeAgo(a.createdAt)}</p>
              </div>
              <Badge tone={LEAD_STATUS_TONE[a.lead!.status] ?? "slate"}>{enumToLabel(a.lead!.status)}</Badge>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

async function SmartActionCenter({ role, userId }: { role: Role; userId: string }) {
  const items = await getActionCenterItems(role, userId);
  return <ActionCenterList items={JSON.parse(JSON.stringify(items))} />;
}

async function HealthOverviewSection({ role, userId }: { role: Role; userId: string }) {
  const organizationId = getOrganizationId(userId);
  const [leadDistribution, propertyDistribution] = await Promise.all([
    getLeadHealthOverview(organizationId, role === "FIELD_EXECUTIVE" ? userId : undefined),
    getPropertyHealthOverview(organizationId),
  ]);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <HealthOverviewCard title="Lead Health Overview" distribution={leadDistribution} />
      <HealthOverviewCard title="Property Health Overview" distribution={propertyDistribution} />
    </div>
  );
}

function PanelSkeleton() {
  return <div className="h-40 animate-pulse rounded-2xl border border-[#E7ECF2] bg-white" />;
}

function DashboardSecondarySkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-64 rounded-2xl border border-[#E7ECF2] bg-white" />
        ))}
      </div>
      <div className="h-72 rounded-2xl border border-[#E7ECF2] bg-white" />
      <div className="h-56 rounded-2xl border border-[#E7ECF2] bg-white" />
    </div>
  );
}
