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

/**
 * simplified-role-workflow (continuation pass, spec item 2/3) - "Today's
 * Work". Rebuilt on the shared src/lib/todays-work.ts service instead of
 * the old executive-dashboard-data.ts (which stayed FE-assigned-only and
 * duplicated its own visit/lead queries) - so ADMIN and DATA_MANAGER browsing
 * their OWN work here see the same org-wide-vs-own-only scoping rule as the
 * dashboard's "Today's Priorities" panel, and a manager drilling into one
 * employee's work via ?employeeId= sees exactly that person's own-scoped
 * items, never the org-wide view, regardless of the manager's own role.
 *
 * FIELD_EXECUTIVE gets the simplified spec: a "Good day, <name>" header,
 * Visits/Follow-ups/Calls counts, Today's Visits as cards, and the shared
 * priorities list for follow-ups/overdue. No revenue or founder analytics -
 * there never was any here, this view has always been operational.
 */
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
    // Feature 5 (daily-ops hardening): active leads with zero forward-looking
    // next action (no future follow-up, no scheduled visit) - the gap where a
    // WARM/COLD lead can silently fall off daily attention while HOT leads
    // already get smart notification protection elsewhere.
    getLeadsNeedingAttention(organizationId, { id: targetUserId, role: targetRole }),
  ]);

  const nextVisit = upcomingVisits[0] ?? null;
  const visitItems = todaysWork.items.filter((i) => i.kind === "VISIT_TODAY");
  const nonVisitItems = todaysWork.items.filter((i) => i.kind !== "VISIT_TODAY");
  const followUpsTodayCount = todaysWork.callToday + todaysWork.whatsappToday + todaysWork.visitExpectedToday + todaysWork.generalToday;

  return (
    <div className="space-y-6 pb-6">
      <div className="border-b border-[#E7ECF2] pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[#1B2430]">
          {viewingOther ? `${targetName}'s Today's Work` : `Good day, ${targetName}`}
        </h1>
        <p className="mt-1 text-sm text-[#596579]">Everything on the plate for today, at a glance.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <CountTile label="Visits" value={todaysWork.visitsToday} icon={CalendarClock} tone="blue" />
        <CountTile label="Follow-ups" value={followUpsTodayCount} icon={BellRing} tone="indigo" />
        <CountTile label="Calls" value={todaysWork.callToday} icon={PhoneCall} tone="green" />
        <CountTile label="Overdue" value={todaysWork.overdue} icon={BellRing} tone="red" />
      </div>

      {/* B2/B9 FE Experience: Next Visit prominent card */}
      {nextVisit && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/30 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#3366FF]">Next Visit</h2>
            <Badge tone="blue">Scheduled</Badge>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-bold text-[#1B2430]">
                {nextVisit.visitTime} &middot; {nextVisit.lead.clientName}
                <span className="ml-2 font-mono text-xs font-normal text-slate-500">({nextVisit.lead.leadCode})</span>
              </p>
              <p className="text-xs text-slate-600 mt-1">
                Date: {formatDate(nextVisit.visitDate)}
                {nextVisit.meetingLocation ? ` · Meeting point: ${nextVisit.meetingLocation}` : ""}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Properties to show ({nextVisit.properties.length}): {nextVisit.properties.map(p => p.property.title).join(", ")}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              {nextVisit.lead.phone && (
                <a
                  href={`tel:${nextVisit.lead.phone}`}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs hover:bg-[#F3F6FA] transition-colors"
                >
                  <PhoneCall className="h-3.5 w-3.5" /> Call Customer
                </a>
              )}
              <Link
                href={`/visits/${nextVisit.id}`}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#3366FF] px-3.5 text-xs font-semibold text-white shadow-xs hover:bg-[#2952CC] transition-colors"
              >
                Open Visit &rarr;
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Today's Visits - dashboard-card style, non-blocking (spec item 13:
          a card, never a forced modal). */}
      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#8A94A6]">Today&apos;s Visits</h2>
        {visitItems.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[#E7ECF2] bg-white p-6 text-center text-sm text-[#8A94A6]">No visits scheduled today.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visitItems.map((v) => (
              <Link key={v.id} href={`/visits/${v.id}`} className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs hover:border-[#3366FF] transition-colors">
                <p className="text-sm font-bold text-[#1B2430]">{v.visitTime} &middot; {v.leadName}</p>
                <p className="mt-1 text-xs text-[#596579]">
                  {v.propertyCount} {v.propertyCount === 1 ? "property" : "properties"}
                  {v.meetingLocation ? ` · ${v.meetingLocation}` : ""}
                  {viewingOther && v.ownerName ? ` · ${v.ownerName}` : ""}
                </p>
                <span className="mt-2 inline-block text-xs font-semibold text-[#3366FF]">Open Visit &rarr;</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* My Follow-ups Today + Overdue, sharing the same priorities list the
          DATA_MANAGER dashboard uses. */}
      <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#8A94A6]">Follow-ups Today &amp; Overdue</h2>
        <TodaysPrioritiesList items={nonVisitItems} />
      </div>

      {/* Feature 5 (daily-ops hardening): Needs Attention - compact, capped
          list, only rendered when non-empty so it never adds noise. */}
      {needsAttention.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-xs">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-amber-700">Needs Attention</h2>
          <div className="space-y-2">
            {needsAttention.slice(0, 10).map((lead) => (
              <Link
                key={lead.id}
                href={`/leads/${lead.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-amber-100 bg-white p-3 shadow-xs hover:border-amber-300 transition-colors"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#1B2430]">{lead.clientName}</p>
                  <p className="mt-0.5 text-xs text-[#596579]">
                    {enumToLabel(lead.status)}
                    {viewingOther && lead.assignedToName ? ` · ${lead.assignedToName}` : ""}
                    {!lead.assignedToId ? " · Unassigned" : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={LEAD_PRIORITY_TONE[lead.priority] ?? "slate"}>{enumToLabel(lead.priority)}</Badge>
                  <span className="text-xs font-semibold text-[#3366FF]">Open &rarr;</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* B2/B9 FE Experience: Recently Completed Visits */}
      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#8A94A6]">Recently Completed Visits</h2>
        {recentlyCompletedVisits.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[#E7ECF2] bg-white p-6 text-center text-sm text-[#8A94A6]">No completed visits recently.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentlyCompletedVisits.map((v) => (
              <Link key={v.id} href={`/visits/${v.id}`} className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs hover:border-[#3366FF] transition-colors">
                <p className="text-sm font-bold text-[#1B2430]">{formatDate(v.visitDate)} at {v.visitTime}</p>
                <p className="mt-0.5 text-xs text-slate-700">Client: {v.lead.clientName}</p>
                <p className="mt-1 text-xs text-[#596579]">
                  Outcome: <span className="font-semibold text-green-600">{v.outcome ? enumToLabel(v.outcome) : "No outcome recorded"}</span>
                </p>
                <span className="mt-2 inline-block text-xs font-semibold text-[#3366FF]">Open Details &rarr;</span>
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
    blue: "bg-[#EFF4FF] text-[#3366FF]",
    indigo: "bg-[#F0EEFF] text-[#6C5CE7]",
    green: "bg-[#E6F7F0] text-[#1FA971]",
    red: "bg-[#FFECEC] text-[#E5484D]",
  };
  return (
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs">
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${toneClasses[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-2 text-2xl font-extrabold text-[#1B2430]">{value}</p>
      <p className="text-xs font-medium text-[#8A94A6]">{label}</p>
    </div>
  );
}
