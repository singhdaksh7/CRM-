import Link from "next/link";
import { Badge, VISIT_STATUS_TONE } from "@/components/ui/badge";
import { enumToLabel } from "@/lib/utils";
import { CalendarDays, CalendarClock, Timer, CheckCircle2 } from "lucide-react";
import type { ManagerVisitBoard as ManagerVisitBoardData } from "@/lib/visit-analytics-data";

/**
 * Manager view of the field, today: Visits Today / Upcoming / In Progress /
 * Completed Today, plus a one-line summary per visit happening today in the
 * required "Rahul - Sagar - 3 Properties - 1/3 visited" shape.
 */
export function ManagerVisitBoard({ board }: { board: ManagerVisitBoardData }) {
  const tiles = [
    { label: "Visits Today", value: board.visitsTodayCount, icon: CalendarDays, tone: "text-[#3366FF]" },
    { label: "Upcoming Visits", value: board.upcomingCount, icon: CalendarClock, tone: "text-[#4F46E5]" },
    { label: "In Progress", value: board.inProgressCount, icon: Timer, tone: "text-[#EA580C]" },
    { label: "Completed Today", value: board.completedTodayCount, icon: CheckCircle2, tone: "text-[#1FA971]" },
  ];

  return (
    <section className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#1B2430]">Visits</h3>
        <Link href="/visits?tab=today" className="text-xs font-semibold text-[#3366FF] hover:underline">View all →</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-[#E7ECF2] bg-[#FAFBFC] p-3">
            <t.icon className={`h-4 w-4 ${t.tone}`} />
            <p className="mt-1.5 text-xl font-bold text-[#1B2430]">{t.value}</p>
            <p className="text-xs text-[#8A94A6]">{t.label}</p>
          </div>
        ))}
      </div>

      {board.todaySummaries.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {board.todaySummaries.map((v) => (
            <Link
              key={v.id}
              href={`/visits/${v.id}`}
              className="flex items-center justify-between gap-2 rounded-xl border border-[#E7ECF2] bg-white px-3 py-2 transition-colors hover:border-[#CCE0FF] hover:bg-[#F5F8FF]"
            >
              <span className="truncate text-sm text-[#1B2430]">{v.summary}</span>
              <Badge tone={VISIT_STATUS_TONE[v.status] ?? "slate"}>{enumToLabel(v.status)}</Badge>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
