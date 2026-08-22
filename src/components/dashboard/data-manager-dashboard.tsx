import Link from "next/link";
import { PhoneCall, MessageCircle, Clock, CalendarClock, AlertTriangle, UserPlus } from "lucide-react";
import { KpiCard } from "@/components/ui/kpi-card";
import { TodaysPrioritiesList } from "./todays-priorities-list";
import { NewLeadsPanel } from "./new-leads-panel";
import type { DataManagerDashboardData } from "@/lib/dm-dashboard-data";

/**
 * simplified-role-workflow (continuation pass, spec item 1) - the
 * DATA_MANAGER dashboard: an operational "what needs doing today" view
 * instead of the founder-oriented KPI/analytics dashboard ADMIN still sees.
 * All data comes from the shared src/lib/todays-work.ts service and
 * src/lib/dm-dashboard-data.ts - no duplicated queries.
 */
export function DataManagerDashboard({ data, firstName }: { data: DataManagerDashboardData; firstName: string }) {
  const { todaysWork, newLeads, newLeadsCount } = data;

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E7ECF2] pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[#1B2430]">Good day, {firstName}</h1>
        <p className="mt-1 text-sm text-[#596579]">Here&apos;s what needs your attention today.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Calls Today" value={todaysWork.callToday} icon={PhoneCall} tone="blue" />
        <KpiCard label="WhatsApps Today" value={todaysWork.whatsappToday} icon={MessageCircle} tone="green" />
        <KpiCard label="Expected Today" value={todaysWork.visitExpectedToday} icon={Clock} tone="purple" />
        <KpiCard label="Visits Today" value={todaysWork.visitsToday} icon={CalendarClock} tone="blue" />
        <KpiCard label="Overdue Follow-ups" value={todaysWork.overdue} icon={AlertTriangle} tone="red" />
        <KpiCard label="New/Unprocessed Leads" value={newLeadsCount} icon={UserPlus} tone="amber" />
      </div>

      <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#1B2430]">Today&apos;s Priorities</h2>
          <Link href="/executive-dashboard" className="text-xs font-semibold text-[#3366FF] hover:text-[#2952CC]">
            Full Today&apos;s Work &rarr;
          </Link>
        </div>
        <TodaysPrioritiesList items={todaysWork.items} />
      </div>

      <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#1B2430]">New / Unprocessed Leads</h2>
          <Link href="/leads" className="text-xs font-semibold text-[#3366FF] hover:text-[#2952CC]">
            All leads &rarr;
          </Link>
        </div>
        <NewLeadsPanel leads={newLeads} totalCount={newLeadsCount} />
      </div>
    </div>
  );
}
