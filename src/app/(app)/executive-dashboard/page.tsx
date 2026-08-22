import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getOrganizationId } from "@/lib/organization";
import { getTodaysWork } from "@/lib/todays-work";
import { prisma } from "@/lib/prisma";
import { TodaysPrioritiesList } from "@/components/dashboard/todays-priorities-list";
import { PhoneCall, CalendarClock, BellRing } from "lucide-react";
import type { Role } from "@prisma/client";

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

  const todaysWork = await getTodaysWork(organizationId, { id: targetUserId, role: targetRole });
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

      {/* Today's Visits - dashboard-card style, non-blocking (spec item 13:
          a card, never a forced modal). */}
      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#8A94A6]">Today&apos;s Visits</h2>
        {visitItems.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[#E7ECF2] bg-white p-6 text-center text-sm text-[#8A94A6]">No visits scheduled today.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visitItems.map((v) => (
              <a key={v.id} href={`/visits/${v.id}`} className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs hover:border-[#3366FF] transition-colors">
                <p className="text-sm font-bold text-[#1B2430]">{v.visitTime} &middot; {v.leadName}</p>
                <p className="mt-1 text-xs text-[#596579]">
                  {v.propertyCount} {v.propertyCount === 1 ? "property" : "properties"}
                  {v.meetingLocation ? ` · ${v.meetingLocation}` : ""}
                  {viewingOther && v.ownerName ? ` · ${v.ownerName}` : ""}
                </p>
                <span className="mt-2 inline-block text-xs font-semibold text-[#3366FF]">Open Visit &rarr;</span>
              </a>
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
