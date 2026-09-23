import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getOrganizationId } from "@/lib/organization";
import { getTodaysWork } from "@/lib/todays-work";
import { getLeadsNeedingAttention } from "@/lib/needs-attention";
import { prisma } from "@/lib/prisma";
import { TodaysPrioritiesList } from "@/components/dashboard/todays-priorities-list";
import { PhoneCall, CalendarClock, BellRing } from "lucide-react";
import type { Role } from "@prisma/client";
import { startOfIstDay } from "@/lib/ist-date";
import { formatDate, enumToLabel } from "@/lib/utils";
import Link from "next/link";
import { Badge, LEAD_PRIORITY_TONE } from "@/components/ui/badge";

export default async function ExecutiveDashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const sp = await searchParams;
  const organizationId = getOrganizationId(session.user);

  let targetUserId = session.user.id;
  let targetRole: Role = session.user.role;
  let targetName = session.user.name.split(" ")[0];
  let viewingOther = false;

  if (sp.employeeId && sp.employeeId !== session.user.id) {
    if (session.user.role === "FIELD_EXECUTIVE") redirect("/executive-dashboard");
    const target = await prisma.user.findFirst({ where: { id: sp.employeeId, organizationId }, select: { id: true, name: true, role: true } });
    if (!target) redirect("/executive-dashboard");
    targetUserId = target.id;
    targetRole = target.role;
    targetName = target.name.split(" ")[0];
    viewingOther = true;
  }

  const todayStart = startOfIstDay(new Date());

  const [todaysWork, upcomingVisits, recentlyCompletedVisits, needsAttention] = await Promise.all([
    getTodaysWork(organizationId, { id: targetUserId, role: targetRole }),
    prisma.visit.findMany({
      where: {
        organizationId,
        assignedToId: targetUserId,
        status: { in: ["SCHEDULED", "CONFIRMED", "IN_PROGRESS", "CLIENT_REACHED", "EMPLOYEE_REACHED"] },
        visitDate: { gte: todayStart },
      },
      include: {
        lead: { select: { id: true, clientName: true, phone: true, leadCode: true } },
        properties: { include: { property: true } },
      },
      orderBy: [
        { visitDate: "asc" },
        { visitTime: "asc" },
      ],
      take: 1,
    }),
    prisma.visit.findMany({
      where: {
        organizationId,
        assignedToId: targetUserId,
        status: "COMPLETED",
      },
      include: {
        lead: { select: { id: true, clientName: true, phone: true, leadCode: true } },
        properties: { include: { property: true } },
      },
      orderBy: { visitDate: "desc" },
      take: 3,
    }),
    getLeadsNeedingAttention(organizationId, { id: targetUserId, role: targetRole }),
  ]);

  const nextVisit = upcomingVisits[0] ?? null;
  const visitItems = todaysWork.items.filter((i) => i.kind === "VISIT_TODAY");
  const nonVisitItems = todaysWork.items.filter((i) => i.kind !== "VISIT_TODAY");
  const followUpsTodayCount = todaysWork.callToday + todaysWork.whatsappToday + todaysWork.visitExpectedToday + todaysWork.generalToday;

  return (
    <div className="space-y-6 pb-6">
      <div className="border-b border-[#E4E4E7] pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[#09090B]">
          {viewingOther ? `${targetName}'s Today's Work` : `Good day, ${targetName}`}
        </h1>
        <p className="mt-1 text-xs text-[#71717A]">Everything on the plate for today, at a glance.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <CountTile label="Visits" value={todaysWork.visitsToday} icon={CalendarClock} tone="blue" />
        <CountTile label="Follow-ups" value={followUpsTodayCount} icon={BellRing} tone="indigo" />
        <CountTile label="Calls" value={todaysWork.callToday} icon={PhoneCall} tone="green" />
        <CountTile label="Overdue" value={todaysWork.overdue} icon={BellRing} tone="red" />
      </div>

      {/* Next Visit prominent card */}
      {nextVisit && (
        <div className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#09090B]">Next Visit</h2>
            <Badge tone="blue">Scheduled</Badge>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-bold text-[#09090B]">
                {nextVisit.visitTime} &middot; {nextVisit.lead.clientName}
                <span className="ml-2 font-mono text-xs font-normal text-[#71717A]">({nextVisit.lead.leadCode})</span>
              </p>
              <p className="text-xs text-[#52525B] mt-1">
                Date: {formatDate(nextVisit.visitDate)}
                {nextVisit.meetingLocation ? ` · Meeting point: ${nextVisit.meetingLocation}` : ""}
              </p>
              <p className="text-xs text-[#71717A] mt-1">
                Properties to show ({nextVisit.properties.length}): {nextVisit.properties.map(p => p.property.title).join(", ")}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              {nextVisit.lead.phone && (
                <a
                  href={`tel:${nextVisit.lead.phone}`}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#E4E4E7] bg-white px-3 text-xs font-semibold text-[#09090B] shadow-2xs hover:bg-[#F4F4F5] transition-colors"
                >
                  <PhoneCall className="h-3.5 w-3.5" /> Call Customer
                </a>
              )}
              <Link
                href={`/visits/${nextVisit.id}`}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#0A0A0A] px-3.5 text-xs font-semibold text-white shadow-2xs hover:bg-[#27272A] border border-[#0A0A0A] transition-colors"
              >
                Open Visit &rarr;
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Today's Visits */}
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#71717A]">Today&apos;s Visits</h2>
        {visitItems.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#E4E4E7] bg-white p-6 text-center text-xs text-[#71717A]">No visits scheduled today.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visitItems.map((v) => (
              <Link key={v.id} href={`/visits/${v.id}`} className="rounded-xl border border-[#E4E4E7] bg-white p-4 shadow-2xs hover:border-[#09090B] transition-colors">
                <p className="text-sm font-semibold text-[#09090B]">{v.visitTime} &middot; {v.leadName}</p>
                <p className="mt-1 text-xs text-[#52525B]">
                  {v.propertyCount} {v.propertyCount === 1 ? "property" : "properties"}
                  {v.meetingLocation ? ` · ${v.meetingLocation}` : ""}
                  {viewingOther && v.ownerName ? ` · ${v.ownerName}` : ""}
                </p>
                <span className="mt-2 inline-block text-xs font-semibold text-[#09090B]">Open Visit &rarr;</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* My Follow-ups Today + Overdue */}
      <div className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-2xs">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#71717A]">Follow-ups Today &amp; Overdue</h2>
        <TodaysPrioritiesList items={nonVisitItems} />
      </div>

      {/* Needs Attention */}
      {needsAttention.length > 0 && (
        <div className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB]/40 p-5 shadow-2xs">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#B45309]">Needs Attention</h2>
          <div className="space-y-2">
            {needsAttention.slice(0, 10).map((lead) => (
              <Link
                key={lead.id}
                href={`/leads/${lead.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-[#FDE68A]/60 bg-white p-3 shadow-2xs hover:border-[#D97706] transition-colors"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#09090B]">{lead.clientName}</p>
                  <p className="mt-0.5 text-xs text-[#52525B]">
                    {enumToLabel(lead.status)}
                    {viewingOther && lead.assignedToName ? ` · ${lead.assignedToName}` : ""}
                    {!lead.assignedToId ? " · Unassigned" : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={LEAD_PRIORITY_TONE[lead.priority] ?? "slate"}>{enumToLabel(lead.priority)}</Badge>
                  <span className="text-xs font-semibold text-[#09090B]">Open &rarr;</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recently Completed Visits */}
      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#71717A]">Recently Completed Visits</h2>
        {recentlyCompletedVisits.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#E4E4E7] bg-white p-6 text-center text-xs text-[#71717A]">No completed visits recently.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentlyCompletedVisits.map((v) => (
              <Link key={v.id} href={`/visits/${v.id}`} className="rounded-xl border border-[#E4E4E7] bg-white p-4 shadow-2xs hover:border-[#09090B] transition-colors">
                <p className="text-sm font-semibold text-[#09090B]">{formatDate(v.visitDate)} at {v.visitTime}</p>
                <p className="mt-0.5 text-xs text-[#52525B]">Client: {v.lead.clientName}</p>
                <p className="mt-1 text-xs text-[#71717A]">
                  Outcome: <span className="font-semibold text-[#16A34A]">{v.outcome ? enumToLabel(v.outcome) : "No outcome recorded"}</span>
                </p>
                <span className="mt-2 inline-block text-xs font-semibold text-[#09090B]">Open Details &rarr;</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CountTile({ label, value, icon: Icon, tone }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; tone: "blue" | "indigo" | "green" | "red" }) {
  const toneClasses: Record<string, string> = {
    blue: "bg-[#F4F4F5] text-[#09090B] border border-[#E4E4E7]",
    indigo: "bg-[#EEF2FF] text-[#4338CA] border border-[#C7D2FE]",
    green: "bg-[#F0FDF4] text-[#15803D] border border-[#BBF7D0]",
    red: "bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA]",
  };
  return (
    <div className="rounded-xl border border-[#E4E4E7] bg-white p-4 shadow-2xs">
      <div className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${toneClasses[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-2 text-2xl font-bold text-[#09090B]">{value}</p>
      <p className="text-xs font-medium text-[#71717A] uppercase tracking-wider">{label}</p>
    </div>
  );
}
