import Link from "next/link";
import { Badge, VISIT_STATUS_TONE } from "@/components/ui/badge";
import { enumToLabel } from "@/lib/utils";
import { CalendarDays, CalendarClock, Timer, CheckCircle2 } from "lucide-react";
import type { ManagerVisitBoard as ManagerVisitBoardData } from "@/lib/visit-analytics-data";

export function ManagerVisitBoard({ board }: { board: ManagerVisitBoardData }) {
  const tiles = [
    { label: "Visits Today", value: board.visitsTodayCount, icon: CalendarDays, tone: "text-[#09090B]" },
    { label: "Upcoming Visits", value: board.upcomingCount, icon: CalendarClock, tone: "text-[#71717A]" },
    { label: "In Progress", value: board.inProgressCount, icon: Timer, tone: "text-[#D97706]" },
    { label: "Completed Today", value: board.completedTodayCount, icon: CheckCircle2, tone: "text-[#16A34A]" },
  ];

  return (
    <section className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-2xs">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[#09090B]">Visits Board</h3>
        <Link href="/visits?tab=today" className="text-xs font-semibold text-[#09090B] hover:underline">View all &rarr;</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] p-3.5">
            <t.icon className={`h-4 w-4 ${t.tone}`} />
            <p className="mt-1.5 text-xl font-bold text-[#09090B]">{t.value}</p>
            <p className="text-xs text-[#71717A] uppercase tracking-wider">{t.label}</p>
          </div>
        ))}
      </div>

      {board.todaySummaries.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {board.todaySummaries.map((v) => (
            <Link
              key={v.id}
              href={`/visits/${v.id}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-[#E4E4E7] bg-white px-3 py-2 transition-colors hover:border-[#D4D4D8] hover:bg-[#FAFAFA]"
            >
              <span className="truncate text-sm text-[#09090B] font-medium">{v.summary}</span>
              <Badge tone={VISIT_STATUS_TONE[v.status] ?? "slate"}>{enumToLabel(v.status)}</Badge>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
