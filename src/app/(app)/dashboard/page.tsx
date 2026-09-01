import { Suspense } from "react";
import { getRscSession } from "@/lib/request-auth";
import { getDashboardCriticalData, getDashboardSecondaryData } from "@/lib/dashboard-data";
import { KpiCard } from "@/components/ui/kpi-card";
import { LeadsAwaitingShortlistPanel } from "@/components/dashboard/leads-awaiting-shortlist-panel";
import { Badge, LEAD_STATUS_TONE } from "@/components/ui/badge";
import { timeAgo, enumToLabel } from "@/lib/utils";
import { Building2, Home, Landmark, Users, UserX, BellRing, CalendarClock, Trophy, ArrowRight, Send, Eye, Heart, CalendarPlus, ListChecks, BarChart3 } from "lucide-react";
import type { Role } from "@prisma/client";
import Link from "next/link";
import { getActionCenterItems, getLeadHealthOverview, getPropertyHealthOverview } from "@/lib/rules";
import { ActionCenterList } from "@/components/dashboard/action-center-list";
import { HealthOverviewCard } from "@/components/dashboard/health-overview-card";
import { DemoDataBanner } from "@/components/dashboard/demo-data-banner";
import { isDemoDataLoaded } from "@/lib/demo-data/status";
import { getFieldOpsSummary } from "@/lib/field-ops-summary-data";
import { FieldOpsSummaryPanel } from "@/components/dashboard/field-ops-summary-panel";
import { getManagerVisitBoard } from "@/lib/visit-analytics-data";
import { ManagerVisitBoard } from "@/components/dashboard/manager-visit-board";
import { DemandAnalyticsPanel, DemandPoolDashboardCards } from "@/components/customers/demand-dashboard-cards";
import { DataManagerDashboard } from "@/components/dashboard/data-manager-dashboard";
import { getDataManagerDashboardData } from "@/lib/dm-dashboard-data";
import { getOrganizationId } from "@/lib/organization";
import { withTiming } from "@/lib/perf";

export default async function DashboardPage() {
  const session = await withTiming("auth.page", "/dashboard", () => getRscSession());
  if (!session) return null;
  const firstName = session.user.name.split(" ")[0];

  // simplified-role-workflow (spec item 1/3): DATA_MANAGER gets an
  // operational "Today's Work" dashboard instead of the founder-oriented
  // KPI/analytics one below - ADMIN's dashboard is completely unchanged.
  if (session.user.role === "DATA_MANAGER") {
    const dmData = await getDataManagerDashboardData(getOrganizationId(session.user), session.user);
    return <DataManagerDashboard data={dmData} firstName={firstName} />;
  }

  const data = await getDashboardCriticalData(session.user.role, session.user.id);
  const demoDataLoaded = session.user.role === "ADMIN" ? await isDemoDataLoaded() : false;

  return (
    <div className="space-y-6">
      {session.user.role === "ADMIN" && <DemoDataBanner initialLoaded={demoDataLoaded} />}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#E7ECF2] pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1B2430]">
            Welcome back, {firstName} Bhaiya 👋
          </h1>
          <p className="mt-1 text-sm text-[#596579]">
            Here is what needs your attention and action today.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/reports"
            className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-[#E7ECF2] px-4 py-2.5 text-xs font-semibold text-[#3366FF] hover:bg-[#EFF4FF] transition-colors shadow-xs"
          >
            <BarChart3 className="h-3.5 w-3.5" /> View Reports
          </Link>
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
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Visits Today" value={data.visitsToday} icon={CalendarClock} tone="blue" />
        <KpiCard label="Follow-ups Due" value={data.followUpsDueToday} icon={BellRing} tone="red" />
        <KpiCard label="Unassigned Leads" value={data.unassignedLeads} icon={UserX} tone="amber" />
        <KpiCard label="Awaiting Shortlist" value={data.leadsAwaitingShortlistCount} icon={ListChecks} tone="red" />
        <KpiCard label="Clients Interested" value={data.clientsInterestedToday} icon={Heart} tone="purple" />
        <KpiCard label="Visit Requests" value={data.visitRequestsReceivedToday} icon={CalendarPlus} tone="green" />
      </div>

      <DemandPoolDashboardCards />
      <DemandAnalyticsPanel />

      <section className="grid gap-4 lg:grid-cols-3">
        <SegmentPanel title="Lead segments" values={data.leadSegments} />
        <SegmentPanel title="Inventory segments" values={data.inventorySegments} />
        <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5"><div className="flex justify-between"><h2 className="font-semibold">Portal operations</h2><Link className="text-xs text-[#3366FF]" href="/reports/portals">Report</Link></div><div className="mt-3 grid grid-cols-2 gap-2 text-sm"><span>Today <b>{data.portalKpis.today}</b></span><span>This week <b>{data.portalKpis.week}</b></span><span>Review <b>{data.portalKpis.needsReview + data.portalKpis.ambiguous}</b></span><span>Failed <b>{data.portalKpis.failed}</b></span><span>Conflicts <b>{data.portalKpis.conflicts}</b></span><span>Dead letters <b>{data.portalKpis.deadLetters}</b></span></div><p className="mt-3 text-xs text-[#596579]">Top source: {data.portalKpis.topSource?.replaceAll("_", " ") ?? "No portal data"}</p></div>
      </section>

      {/* Manager view of today's field work: Visits Today / Upcoming /
          In Progress / Completed Today, with a per-visit progress summary. */}
      {/* Only ADMIN reaches this point now - DATA_MANAGER returns early above with its own operational dashboard. */ session.user.role === "ADMIN" && (
        <Suspense fallback={<PanelSkeleton />}>
          <ManagerVisitBoardSection organizationId={getOrganizationId(session.user)} />
        </Suspense>
      )}

      {/* Objective 12 - Manager Dashboard field-ops widgets */}
      {/* Only ADMIN reaches this point now - DATA_MANAGER returns early above with its own operational dashboard. */ session.user.role === "ADMIN" && (
        <Suspense fallback={<PanelSkeleton />}>
          <FieldOpsSummarySection organizationId={getOrganizationId(session.user)} />
        </Suspense>
      )}

      {/* Smart Action Center - Phase 1 deterministic rule engine */}
      <Suspense fallback={<PanelSkeleton />}>
        <SmartActionCenter role={session.user.role} userId={session.user.id} />
      </Suspense>

      {/* Lead & Property Health Overview */}
      <Suspense fallback={<div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><PanelSkeleton /><PanelSkeleton /></div>}>
        <HealthOverviewSection role={session.user.role} userId={session.user.id} organizationId={getOrganizationId(session.user)} />
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

function SegmentPanel({ title, values }: { title: string; values: Record<string, number> }) { return <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5"><h2 className="font-semibold">{title}</h2><div className="mt-3 grid grid-cols-2 gap-2 text-sm">{Object.entries(values).map(([key, value]) => <span key={key}>{key.replace(/([A-Z])/g, " $1")} <b>{value}</b></span>)}</div></div>; }

async function DashboardSecondary({ role, userId }: { role: Role; userId: string }) {
  const data = await getDashboardSecondaryData(role, userId);

  return (
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
                </Link>{"  "}&middot; {a.description}
              </p>
              <p className="mt-0.5 text-xs text-[#8A94A6]">{a.actor ? `${a.actor.name} · ` : ""}{timeAgo(a.createdAt)}</p>
            </div>
            <Badge tone={LEAD_STATUS_TONE[a.lead!.status] ?? "slate"}>{enumToLabel(a.lead!.status)}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

async function ManagerVisitBoardSection({ organizationId }: { organizationId: string }) {
  const board = await getManagerVisitBoard(organizationId);
  return <ManagerVisitBoard board={board} />;
}

async function FieldOpsSummarySection({ organizationId }: { organizationId: string }) {
  const summary = await getFieldOpsSummary(organizationId);
  return <FieldOpsSummaryPanel summary={summary} />;
}

async function SmartActionCenter({ role, userId }: { role: Role; userId: string }) {
  const items = await getActionCenterItems(role, userId);
  return <ActionCenterList items={JSON.parse(JSON.stringify(items))} />;
}

async function HealthOverviewSection({ role, userId, organizationId }: { role: Role; userId: string; organizationId: string }) {
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
    <div className="animate-pulse h-64 rounded-2xl border border-[#E7ECF2] bg-white" />
  );
}
