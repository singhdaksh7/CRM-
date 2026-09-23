import { Suspense } from "react";
import { auth } from "@/lib/auth";
import { getDashboardCriticalData, getDashboardSecondaryData } from "@/lib/dashboard-data";
import { KpiCard } from "@/components/ui/kpi-card";
import { LeadsAwaitingShortlistPanel } from "@/components/dashboard/leads-awaiting-shortlist-panel";
import { Badge, LEAD_STATUS_TONE } from "@/components/ui/badge";
import { timeAgo, enumToLabel, getTimeBasedGreeting } from "@/lib/utils";
import { Users, UserX, BellRing, CalendarClock, Heart, CalendarPlus, ListChecks, BarChart3, ArrowRight } from "lucide-react";
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
import { DataManagerDashboard } from "@/components/dashboard/data-manager-dashboard";
import { getDataManagerQueues } from "@/lib/dm-queues";
import { getOrganizationId } from "@/lib/organization";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) return null;
  const firstName = session.user.name.split(" ")[0];

  if (session.user.role === "DATA_MANAGER") {
    const queues = await getDataManagerQueues(getOrganizationId(session.user), session.user);
    return <DataManagerDashboard queues={queues} firstName={firstName} />;
  }

  const data = await getDashboardCriticalData(session.user.role, session.user.id);
  const demoDataLoaded = session.user.role === "ADMIN" ? await isDemoDataLoaded() : false;

  return (
    <div className="space-y-6">
      {session.user.role === "ADMIN" && <DemoDataBanner initialLoaded={demoDataLoaded} />}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#E4E4E7] pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#09090B]">
            {getTimeBasedGreeting()}{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-1 text-xs text-[#71717A]">
            Here is what needs your attention and action today.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/reports"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-[#E4E4E7] px-3.5 py-2 text-xs font-semibold text-[#09090B] hover:bg-[#F4F4F5] transition-colors shadow-2xs"
          >
            <BarChart3 className="h-3.5 w-3.5 text-[#71717A]" /> View Reports
          </Link>
          <Link
            href="/leads?add=true"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0A0A0A] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#27272A] transition-colors shadow-2xs border border-[#0A0A0A]"
          >
            + Add Lead
          </Link>
          <Link
            href="/properties?add=true"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-[#E4E4E7] px-3.5 py-2 text-xs font-semibold text-[#09090B] hover:bg-[#F4F4F5] transition-colors shadow-2xs"
          >
            + Add Property
          </Link>
        </div>
      </div>

      {/* KPI Metric Cards Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Visits Today" value={data.visitsToday} icon={CalendarClock} tone="blue" />
        <KpiCard label="Follow-ups Due" value={data.followUpsDueToday} icon={BellRing} tone="red" />
        <KpiCard label="Unassigned Leads" value={data.unassignedLeads} icon={UserX} tone="amber" />
        <KpiCard label="Awaiting Shortlist" value={data.leadsAwaitingShortlistCount} icon={ListChecks} tone="red" />
        <KpiCard label="Clients Interested" value={data.clientsInterestedToday} icon={Heart} tone="purple" />
        <KpiCard label="Visit Requests" value={data.visitRequestsReceivedToday} icon={CalendarPlus} tone="green" />
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <SegmentPanel title="Lead segments" values={data.leadSegments} />
        <SegmentPanel title="Inventory segments" values={data.inventorySegments} />
        <div className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-2xs">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#09090B]">Portal operations</h2>
            <Link className="text-xs font-medium text-[#71717A] hover:text-[#09090B]" href="/reports/portals">Report &rarr;</Link>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-[#52525B]">
            <span>Today <b className="text-[#09090B]">{data.portalKpis.today}</b></span>
            <span>This week <b className="text-[#09090B]">{data.portalKpis.week}</b></span>
            <span>Review <b className="text-[#09090B]">{data.portalKpis.needsReview + data.portalKpis.ambiguous}</b></span>
            <span>Failed <b className="text-[#09090B]">{data.portalKpis.failed}</b></span>
            <span>Conflicts <b className="text-[#09090B]">{data.portalKpis.conflicts}</b></span>
            <span>Dead letters <b className="text-[#09090B]">{data.portalKpis.deadLetters}</b></span>
          </div>
          <p className="mt-3 text-xs text-[#71717A]">Top source: {data.portalKpis.topSource?.replaceAll("_", " ") ?? "No portal data"}</p>
        </div>
      </section>

      {session.user.role === "ADMIN" && (
        <Suspense fallback={<PanelSkeleton />}>
          <ManagerVisitBoardSection organizationId={getOrganizationId(session.user)} />
        </Suspense>
      )}

      {session.user.role === "ADMIN" && (
        <Suspense fallback={<PanelSkeleton />}>
          <FieldOpsSummarySection organizationId={getOrganizationId(session.user)} />
        </Suspense>
      )}

      {/* Smart Action Center */}
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

function SegmentPanel({ title, values }: { title: string; values: Record<string, number> }) {
  return (
    <div className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-2xs">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[#09090B]">{title}</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-[#52525B]">
        {Object.entries(values).map(([key, value]) => (
          <span key={key}>
            {key.replace(/([A-Z])/g, " $1")} <b className="text-[#09090B]">{value}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

async function DashboardSecondary({ role, userId }: { role: Role; userId: string }) {
  const data = await getDashboardSecondaryData(role, userId);

  return (
    <div className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-2xs">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#09090B]">Recent Lead Activity</h3>
          <p className="text-xs text-[#71717A]">Latest interactions, follow-ups & stage updates</p>
        </div>
        <Link href="/leads" className="inline-flex items-center gap-1 text-xs font-medium text-[#71717A] hover:text-[#09090B]">
          View all leads <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="space-y-3">
        {data.recentActivities.length === 0 && <p className="text-xs text-[#71717A]">No recent activity recorded yet.</p>}
        {data.recentActivities.map((a) => (
          <div key={a.id} className="flex items-start justify-between gap-3 border-b border-[#E4E4E7] pb-3 last:border-0 last:pb-0">
            <div>
              <p className="text-sm text-[#52525B]">
                <Link href={`/leads/${a.leadId}`} className="font-semibold text-[#09090B] hover:underline transition-colors">
                  {a.lead!.clientName}
                </Link>{" "}&middot; {a.description}
              </p>
              <p className="mt-0.5 text-xs text-[#71717A]">{a.actor ? `${a.actor.name} · ` : ""}{timeAgo(a.createdAt)}</p>
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
  return <div className="h-40 animate-pulse rounded-xl border border-[#E4E4E7] bg-white" />;
}

function DashboardSecondarySkeleton() {
  return (
    <div className="animate-pulse h-64 rounded-xl border border-[#E4E4E7] bg-white" />
  );
}
