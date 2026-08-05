import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ScheduleVisitModal } from "@/components/visits/schedule-visit-modal";
import { VisitRowActions } from "@/components/visits/visit-row-actions";
import { VisitFieldActions } from "@/components/visits/visit-field-actions";
import { SuggestedRoutePanel } from "@/components/visits/suggested-route-panel";
import { EmptyState } from "@/components/ui/states";
import { Badge, VISIT_STATUS_TONE } from "@/components/ui/badge";
import { Pagination, DEFAULT_PAGE_SIZE, parsePage } from "@/components/ui/pagination";
import { formatDate, enumToLabel } from "@/lib/utils";
import { withTiming } from "@/lib/perf";
import Link from "next/link";
import type { Prisma } from "@prisma/client";

type VisitWithRelations = Prisma.VisitGetPayload<{ include: { lead: true; property: true; assignedTo: true } }>;

const TABS = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "all", label: "All Visits" },
  { key: "employee", label: "Employee-wise" },
];

const SAFETY_CAP = 300;

export default async function VisitsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await auth();
  const sp = await searchParams;
  const tab = sp.tab ?? "today";
  const page = parsePage(sp.page);
  const canManage = session!.user.role !== "FIELD_EXECUTIVE";

  const where: Prisma.VisitWhereInput = {};
  if (session!.user.role === "FIELD_EXECUTIVE") where.assignedToId = session!.user.id;

  const now = new Date();
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999);

  if (tab === "today") where.visitDate = { gte: startOfToday, lte: endOfToday };
  else if (tab === "upcoming") where.visitDate = { gt: endOfToday };
  if (tab === "employee" && sp.employeeId) where.assignedToId = sp.employeeId;

  const isAllTab = tab === "all";

  const [visits, totalCount, leads, properties, employees] = await withTiming("visitsPageQuery", "/visits", () =>
    Promise.all([
      prisma.visit.findMany({
        where,
        include: { lead: true, property: true, assignedTo: true },
        orderBy: { visitDate: tab === "upcoming" ? "asc" : "desc" },
        skip: isAllTab ? (page - 1) * DEFAULT_PAGE_SIZE : 0,
        take: isAllTab ? DEFAULT_PAGE_SIZE : SAFETY_CAP,
      }),
      isAllTab ? prisma.visit.count({ where }) : Promise.resolve(null),
      prisma.lead.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.property.findMany({ where: { status: "AVAILABLE" }, take: 200 }),
      prisma.user.findMany({ where: { role: "FIELD_EXECUTIVE", status: "ACTIVE" } }),
    ])
  );

  const grouped = new Map<string, VisitWithRelations[]>();
  if (tab === "employee") {
    for (const v of visits) {
      const key = v.assignedTo?.name ?? "Unassigned";
      grouped.set(key, [...(grouped.get(key) ?? []), v]);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1B2430]">Property Visits</h1>
          <p className="text-sm text-[#596579]">{isAllTab ? totalCount : visits.length} visits</p>
        </div>
        {canManage && <ScheduleVisitModal leads={leads} properties={properties} employees={employees} />}
      </div>

      {tab === "today" && (session!.user.role === "FIELD_EXECUTIVE" || sp.employeeId) && (
        <SuggestedRoutePanel employeeId={session!.user.role === "FIELD_EXECUTIVE" ? session!.user.id : sp.employeeId!} />
      )}

      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-[#E7ECF2] bg-white p-1 text-sm shadow-xs w-fit">
        {TABS.map((t) => (
          <Link key={t.key} href={`/visits?tab=${t.key}`} className={`whitespace-nowrap rounded-xl px-3.5 py-1.5 font-semibold transition-all ${tab === t.key ? "bg-[#3366FF] text-white shadow-xs" : "text-[#596579] hover:text-[#1B2430] hover:bg-[#F3F6FA]"}`}>
            {t.label}
          </Link>
        ))}
      </div>

      {visits.length === 0 ? (
        <EmptyState title="No visits found" description="Schedule a visit to get started." />
      ) : tab === "employee" ? (
        <div className="space-y-4">
          {[...grouped.entries()].map(([name, vs]) => (
            <div key={name} className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs">
              <h3 className="mb-3 text-sm font-bold text-[#1B2430]">{name} ({vs.length})</h3>
              <VisitTable visits={vs} canManage={canManage} role={session!.user.role} />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs">
          <VisitTable visits={visits} canManage={canManage} role={session!.user.role} />
        </div>
      )}

      {isAllTab && totalCount !== null && (
        <Pagination basePath="/visits" currentParams={sp} page={page} pageSize={DEFAULT_PAGE_SIZE} totalCount={totalCount} />
      )}
    </div>
  );
}

function VisitTable({ visits, canManage, role }: { visits: VisitWithRelations[]; canManage: boolean; role: string }) {
  const canSeeOwnerPhone = role !== "FIELD_EXECUTIVE";
  return (
    <div className="space-y-3">
      {visits.map((v) => (
        <div key={v.id} className="rounded-xl border border-[#E7ECF2] bg-[#FAFBFC] p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <Link href={`/leads/${v.leadId}`} className="text-sm font-bold text-[#1B2430] hover:text-[#3366FF]">{v.lead.clientName}</Link>
              <span className="text-[#8A94A6]"> &middot; {v.property.title}</span>
              <p className="text-xs text-[#8A94A6] mt-0.5">{formatDate(v.visitDate)} at {v.visitTime} &middot; {v.assignedTo?.name ?? "Unassigned"} &middot; {v.meetingLocation}</p>
            </div>
            <Badge tone={VISIT_STATUS_TONE[v.status]}>{enumToLabel(v.status)}</Badge>
          </div>
          {v.conflictStatus === "OVERRIDDEN" && (
            <p className="mt-1.5 text-xs font-semibold text-[#E6A23C]">⚠ Scheduling conflict overridden{v.conflictDetail ? `: ${v.conflictDetail}` : ""}</p>
          )}
          <div className="mt-2">
            <VisitFieldActions
              visitId={v.id}
              status={v.status}
              propertyAddress={`${v.property.address}, ${v.property.area}, Delhi`}
              latitude={v.property.latitude}
              longitude={v.property.longitude}
              clientName={v.lead.clientName}
              clientPhone={v.lead.phone}
              ownerPhone={v.property.ownerPhone}
              canSeeOwnerPhone={canSeeOwnerPhone}
            />
          </div>
          {canManage && <div className="mt-2"><VisitRowActions visitId={v.id} status={v.status} outcome={v.outcome} /></div>}
        </div>
      ))}
    </div>
  );
}
