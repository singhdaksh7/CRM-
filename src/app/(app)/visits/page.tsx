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
import { computeVisitProgress, needsVisitOutcomeWhere, todaysVisitsWhere, upcomingVisitsWhere, visitRoleScopeWhere } from "@/lib/visits";
import { assignedToSelect } from "@/lib/user-select";
import Link from "next/link";
import type { Prisma } from "@prisma/client";

type VisitWithRelations = Prisma.VisitGetPayload<{
  include: { lead: true; property: true; assignedTo: { select: typeof assignedToSelect }; properties: { include: { property: true } } };
}>;

const TABS = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "needs-outcome", label: "Needs Outcome" },
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
  const organizationId = getOrganizationId(user);
  const now = new Date();

  let where: Prisma.VisitWhereInput = visitRoleScopeWhere(organizationId, user);
  if (tab === "today") where = todaysVisitsWhere(organizationId, now, user.role === "FIELD_EXECUTIVE" ? user.id : undefined);
  else if (tab === "upcoming") where = upcomingVisitsWhere(organizationId, now, user.role === "FIELD_EXECUTIVE" ? user.id : undefined);
  else if (tab === "needs-outcome") where = needsVisitOutcomeWhere(organizationId, now, user.role === "FIELD_EXECUTIVE" ? user.id : undefined);

  if (tab === "employee" && sp.employeeId && canManage) where.assignedToId = sp.employeeId;

  const isAllTab = tab === "all";
  const isNeedsOutcomeTab = tab === "needs-outcome";

  const [visits, totalCount, needsOutcomeCount, leads, properties, employees] = await withTiming("visitsPageQuery", "/visits", () =>
    Promise.all([
      prisma.visit.findMany({
        where,
        include: { lead: true, property: true, assignedTo: { select: assignedToSelect }, properties: { include: { property: true }, orderBy: { sequence: "asc" } } },
        orderBy: { visitDate: tab === "upcoming" ? "asc" : "desc" },
        skip: isAllTab ? (page - 1) * DEFAULT_PAGE_SIZE : 0,
        take: isAllTab ? DEFAULT_PAGE_SIZE : SAFETY_CAP,
      }),
      isAllTab ? prisma.visit.count({ where }) : Promise.resolve(null),
      prisma.visit.count({ where: needsVisitOutcomeWhere(organizationId, now, user.role === "FIELD_EXECUTIVE" ? user.id : undefined) }),
      canManage ? prisma.lead.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 100 }) : Promise.resolve([]),
      canManage ? prisma.property.findMany({ where: { organizationId, status: "AVAILABLE" }, take: 200 }) : Promise.resolve([]),
      canManage ? prisma.user.findMany({ where: { organizationId, role: { in: ["FIELD_EXECUTIVE", "ADMIN"] }, status: "ACTIVE" }, select: { id: true, name: true, role: true } }) : Promise.resolve([]),
    ])
  );

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
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#09090B]">Property Visits</h1>
          <p className="mt-1 text-sm text-[#52525B]">{isAllTab ? totalCount : visits.length} scheduled visits</p>
        </div>
        {canManage && (
          <ScheduleVisitModal
            leads={leads}
            properties={properties}
            employees={employees}
            initialLeadId={sp.leadId}
            initialPropertyId={sp.propertyId}
          />
        )}
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

      <div className="flex gap-1 overflow-x-auto rounded-lg border border-[#E4E4E7] bg-[#F4F4F5] p-1 text-sm w-fit">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/visits?tab=${t.key}`}
            className={`whitespace-nowrap rounded-md px-3.5 py-1.5 font-medium transition-all ${
              tab === t.key
                ? "bg-[#0A0A0A] text-white shadow-xs"
                : "text-[#52525B] hover:text-[#09090B] hover:bg-white"
            }`}
          >
            {t.label}{t.key === "needs-outcome" ? ` (${needsOutcomeCount})` : ""}
          </Link>
        ))}
      </div>

      {visits.length === 0 ? (
        <EmptyState title={isNeedsOutcomeTab ? "No visits need an outcome" : "No visits found"} description={isNeedsOutcomeTab ? "" : tab === "upcoming" ? "Nothing scheduled beyond today." : "Schedule a visit to get started."} />
      ) : tab === "employee" ? (
        <div className="space-y-4">
          {[...grouped.entries()].map(([name, vs]) => (
            <div key={name} className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-xs">
              <h3 className="mb-3 text-sm font-semibold text-[#09090B]">{name} ({vs.length})</h3>
              <VisitList visits={vs} />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-xs">
          <VisitList visits={visits} />
        </div>
      )}

      {isAllTab && totalCount !== null && (
        <Pagination basePath="/visits" currentParams={sp} page={page} pageSize={DEFAULT_PAGE_SIZE} totalCount={totalCount} />
      )}
    </div>
  );
}

function VisitList({ visits }: { visits: VisitWithRelations[] }) {
  return (
    <div className="space-y-2.5">
      {visits.map((v) => {
        const progress = computeVisitProgress(v.properties);
        return (
          <Link
            key={v.id}
            href={`/visits/${v.id}`}
            className="block rounded-lg border border-[#E4E4E7] bg-white p-4 transition-colors hover:border-[#D4D4D8] hover:bg-[#FAFAFA]"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#09090B]">
                  {v.lead.clientName}
                  <span className="ml-2 font-mono text-xs font-normal text-[#71717A]">{v.lead.leadCode}</span>
                </p>
                <p className="mt-1 text-xs text-[#52525B]">
                  {formatDate(v.visitDate)} at {v.visitTime} &middot; {v.assignedTo?.name ?? "Unassigned"}
                </p>
                <p className="mt-0.5 text-xs text-[#71717A]">
                  {progress.total} {progress.total === 1 ? "property" : "properties"}
                  {progress.resolved > 0 && <> &middot; {progress.label}</>}
                  {v.catalogueShareId && <> &middot; from catalogue</>}
                </p>
              </div>
              <Badge tone={VISIT_STATUS_TONE[v.status] ?? "slate"}>{enumToLabel(v.status)}</Badge>
            </div>
            {v.conflictStatus === "OVERRIDDEN" && (
              <p className="mt-2 text-xs font-medium text-amber-600">⚠ Scheduling conflict overridden{v.conflictDetail ? `: ${v.conflictDetail}` : ""}</p>
            )}
          </Link>
        );
      })}
    </div>
  );
}
