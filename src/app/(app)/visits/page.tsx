import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ScheduleVisitModal } from "@/components/visits/schedule-visit-modal";
import { VisitRowActions } from "@/components/visits/visit-row-actions";
import { EmptyState } from "@/components/ui/states";
import { Badge, VISIT_STATUS_TONE } from "@/components/ui/badge";
import { formatDate, enumToLabel } from "@/lib/utils";
import Link from "next/link";
import type { Prisma } from "@prisma/client";

type VisitWithRelations = Prisma.VisitGetPayload<{ include: { lead: true; property: true; assignedTo: true } }>;

const TABS = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "all", label: "All Visits" },
  { key: "employee", label: "Employee-wise" },
];

export default async function VisitsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await auth();
  const sp = await searchParams;
  const tab = sp.tab ?? "today";
  const canManage = session!.user.role !== "FIELD_EXECUTIVE";

  const where: Prisma.VisitWhereInput = {};
  if (session!.user.role === "FIELD_EXECUTIVE") where.assignedToId = session!.user.id;

  const now = new Date();
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999);

  if (tab === "today") where.visitDate = { gte: startOfToday, lte: endOfToday };
  else if (tab === "upcoming") where.visitDate = { gt: endOfToday };
  if (tab === "employee" && sp.employeeId) where.assignedToId = sp.employeeId;

  const [visits, leads, properties, employees] = await Promise.all([
    prisma.visit.findMany({ where, include: { lead: true, property: true, assignedTo: true }, orderBy: { visitDate: tab === "upcoming" ? "asc" : "desc" } }),
    prisma.lead.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.property.findMany({ where: { status: "AVAILABLE" } }),
    prisma.user.findMany({ where: { role: "FIELD_EXECUTIVE", status: "ACTIVE" } }),
  ]);

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
          <h1 className="text-xl font-semibold text-slate-900">Property Visits</h1>
          <p className="text-sm text-slate-500">{visits.length} visits</p>
        </div>
        {canManage && <ScheduleVisitModal leads={leads} properties={properties} employees={employees} />}
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 text-sm w-fit">
        {TABS.map((t) => (
          <Link key={t.key} href={`/visits?tab=${t.key}`} className={`whitespace-nowrap rounded-md px-3 py-1.5 font-medium ${tab === t.key ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"}`}>
            {t.label}
          </Link>
        ))}
      </div>

      {visits.length === 0 ? (
        <EmptyState title="No visits found" description="Schedule a visit to get started." />
      ) : tab === "employee" ? (
        <div className="space-y-4">
          {[...grouped.entries()].map(([name, vs]) => (
            <div key={name} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">{name} ({vs.length})</h3>
              <VisitTable visits={vs} canManage={canManage} />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <VisitTable visits={visits} canManage={canManage} />
        </div>
      )}
    </div>
  );
}

function VisitTable({ visits, canManage }: { visits: VisitWithRelations[]; canManage: boolean }) {
  return (
    <div className="space-y-3">
      {visits.map((v) => (
        <div key={v.id} className="rounded-lg border border-slate-100 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <Link href={`/leads/${v.leadId}`} className="text-sm font-medium text-slate-800 hover:text-indigo-600">{v.lead.clientName}</Link>
              <span className="text-slate-400"> &middot; {v.property.title}</span>
              <p className="text-xs text-slate-400">{formatDate(v.visitDate)} at {v.visitTime} &middot; {v.assignedTo?.name ?? "Unassigned"} &middot; {v.meetingLocation}</p>
            </div>
            <Badge tone={VISIT_STATUS_TONE[v.status]}>{enumToLabel(v.status)}</Badge>
          </div>
          {canManage && <div className="mt-2"><VisitRowActions visitId={v.id} status={v.status} outcome={v.outcome} /></div>}
        </div>
      ))}
    </div>
  );
}
