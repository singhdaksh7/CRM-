import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ScheduleVisitModal } from "@/components/visits/schedule-visit-modal";
import { SuggestedRoutePanel } from "@/components/visits/suggested-route-panel";
import { PendingVisitRequests } from "@/components/visits/pending-visit-requests";
import { getVisitRequestCatalogueOptions, listCatalogueVisitRequests } from "@/lib/visit-requests";
import { EmptyState } from "@/components/ui/states";
import { Badge, VISIT_STATUS_TONE } from "@/components/ui/badge";
import { Pagination, DEFAULT_PAGE_SIZE, parsePage } from "@/components/ui/pagination";
import { formatDate, enumToLabel } from "@/lib/utils";
import { withTiming } from "@/lib/perf";
import { getOrganizationId } from "@/lib/organization";
import { computeVisitProgress, todaysVisitsWhere, upcomingVisitsWhere, visitRoleScopeWhere } from "@/lib/visits";
import Link from "next/link";
import type { Prisma } from "@prisma/client";

type VisitWithRelations = Prisma.VisitGetPayload<{
  include: { lead: true; property: true; assignedTo: true; properties: { include: { property: true } } };
}>;

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
  const user = session!.user;
  const canManage = user.role !== "FIELD_EXECUTIVE";
  const organizationId = getOrganizationId(user.id);
  const now = new Date();

  // Three bugs previously lived in these five lines:
  //   1. `where` started as `{}` - no organizationId scope at all.
  //   2. Day boundaries came from `setHours(0,0,0,0)` in the SERVER's
  //      timezone. On a UTC host, a visit at 11:00 IST tomorrow is stored as
  //      05:30Z tomorrow, but "end of today" was computed as 23:59:59 UTC
  //      today - so tomorrow-early-IST visits fell on the wrong side of the
  //      boundary and vanished from Upcoming.
  //   3. Upcoming included CANCELLED and COMPLETED visits.
  // All three are now handled by the shared IST-anchored helpers.
  let where: Prisma.VisitWhereInput = visitRoleScopeWhere(organizationId, user);
  if (tab === "today") where = todaysVisitsWhere(organizationId, now, user.role === "FIELD_EXECUTIVE" ? user.id : undefined);
  else if (tab === "upcoming") where = upcomingVisitsWhere(organizationId, now, user.role === "FIELD_EXECUTIVE" ? user.id : undefined);

  if (tab === "employee" && sp.employeeId && canManage) where.assignedToId = sp.employeeId;

  const isAllTab = tab === "all";

  const [visits, totalCount, leads, properties, employees] = await withTiming("visitsPageQuery", "/visits", () =>
    Promise.all([
      prisma.visit.findMany({
        where,
        include: { lead: true, property: true, assignedTo: true, properties: { include: { property: true }, orderBy: { sequence: "asc" } } },
        orderBy: { visitDate: tab === "upcoming" ? "asc" : "desc" },
        skip: isAllTab ? (page - 1) * DEFAULT_PAGE_SIZE : 0,
        take: isAllTab ? DEFAULT_PAGE_SIZE : SAFETY_CAP,
      }),
      isAllTab ? prisma.visit.count({ where }) : Promise.resolve(null),
      // Every supporting query is organization-scoped too - previously none of
      // them were, so the Schedule Visit modal could offer another org's data.
      canManage ? prisma.lead.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 100 }) : Promise.resolve([]),
      canManage ? prisma.property.findMany({ where: { organizationId, status: "AVAILABLE" }, take: 200 }) : Promise.resolve([]),
      canManage ? prisma.user.findMany({ where: { organizationId, role: "FIELD_EXECUTIVE", status: "ACTIVE" } }) : Promise.resolve([]),
    ])
  );

  // Pending client visit REQUESTS. A Field Executive never sees this queue -
  // reviewing and confirming a request is an Admin/Data Manager decision, and
  // the client's contact details ride along with it.
  const visitRequests = canManage ? await listCatalogueVisitRequests(organizationId) : [];
  const catalogueOptions = canManage ? await getVisitRequestCatalogueOptions(visitRequests, organizationId) : {};

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

      {canManage && (
        <PendingVisitRequests
          requests={visitRequests.map((r) => ({
            id: r.id,
            status: r.status,
            catalogueShareId: r.catalogueShareId,
            catalogueTitle: r.catalogueTitle,
            leadId: r.leadId,
            leadCode: r.leadCode,
            clientName: r.clientName,
            clientPhone: r.clientPhone,
            requestedProperties: r.requestedProperties,
            propertyCount: r.propertyCount,
            requestedAtLabel: formatDate(r.requestedAt),
            preferredDate: r.preferredDate,
            preferredWindow: r.preferredWindow,
            message: r.message,
            interactionIds: r.interactionIds,
            scheduledVisitId: r.scheduledVisitId,
          }))}
          catalogueOptions={catalogueOptions}
          employees={employees.map((e) => ({ id: e.id, name: e.name }))}
        />
      )}

      {tab === "today" && (user.role === "FIELD_EXECUTIVE" || sp.employeeId) && (
        <SuggestedRoutePanel employeeId={user.role === "FIELD_EXECUTIVE" ? user.id : sp.employeeId!} />
      )}

      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-[#E7ECF2] bg-white p-1 text-sm shadow-xs w-fit">
        {TABS.map((t) => (
          <Link key={t.key} href={`/visits?tab=${t.key}`} className={`whitespace-nowrap rounded-xl px-3.5 py-1.5 font-semibold transition-all ${tab === t.key ? "bg-[#3366FF] text-white shadow-xs" : "text-[#596579] hover:text-[#1B2430] hover:bg-[#F3F6FA]"}`}>
            {t.label}
          </Link>
        ))}
      </div>

      {visits.length === 0 ? (
        <EmptyState title="No visits found" description={tab === "upcoming" ? "Nothing scheduled beyond today." : "Schedule a visit to get started."} />
      ) : tab === "employee" ? (
        <div className="space-y-4">
          {[...grouped.entries()].map(([name, vs]) => (
            <div key={name} className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs">
              <h3 className="mb-3 text-sm font-bold text-[#1B2430]">{name} ({vs.length})</h3>
              <VisitList visits={vs} />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs">
          <VisitList visits={visits} />
        </div>
      )}

      {isAllTab && totalCount !== null && (
        <Pagination basePath="/visits" currentParams={sp} page={page} pageSize={DEFAULT_PAGE_SIZE} totalCount={totalCount} />
      )}
    </div>
  );
}

/**
 * One row per visit, showing everything the Upcoming Visits view is required
 * to show: client name, lead code, date, time, assigned executive, number of
 * properties, and status. The whole row links to the visit detail page.
 */
function VisitList({ visits }: { visits: VisitWithRelations[] }) {
  return (
    <div className="space-y-3">
      {visits.map((v) => {
        const progress = computeVisitProgress(v.properties);
        return (
          <Link
            key={v.id}
            href={`/visits/${v.id}`}
            className="block rounded-xl border border-[#E7ECF2] bg-[#FAFBFC] p-3.5 transition-colors hover:border-[#CCE0FF] hover:bg-[#F5F8FF]"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#1B2430]">
                  {v.lead.clientName}
                  <span className="ml-2 font-mono text-xs font-normal text-[#8A94A6]">{v.lead.leadCode}</span>
                </p>
                <p className="mt-0.5 text-xs text-[#596579]">
                  {formatDate(v.visitDate)} at {v.visitTime} &middot; {v.assignedTo?.name ?? "Unassigned"}
                </p>
                <p className="mt-0.5 text-xs text-[#8A94A6]">
                  {progress.total} {progress.total === 1 ? "property" : "properties"}
                  {progress.resolved > 0 && <> &middot; {progress.label}</>}
                  {v.catalogueShareId && <> &middot; from catalogue</>}
                </p>
              </div>
              <Badge tone={VISIT_STATUS_TONE[v.status] ?? "slate"}>{enumToLabel(v.status)}</Badge>
            </div>
            {v.conflictStatus === "OVERRIDDEN" && (
              <p className="mt-1.5 text-xs font-semibold text-[#E6A23C]">⚠ Scheduling conflict overridden{v.conflictDetail ? `: ${v.conflictDetail}` : ""}</p>
            )}
          </Link>
        );
      })}
    </div>
  );
}
