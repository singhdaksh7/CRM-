import Link from "next/link";
import { PhoneCall, MessageCircle, Clock, CalendarClock, AlertTriangle, UserPlus, Search, UserCog, Phone } from "lucide-react";
import { KpiCard } from "@/components/ui/kpi-card";
import { TodaysPrioritiesList } from "./todays-priorities-list";
import { NewLeadsPanel } from "./new-leads-panel";
import type { DataManagerDashboardData } from "@/lib/dm-dashboard-data";
import { normalizeIndianPhone } from "@/integrations/whatsapp";
import { formatINR, timeAgo, enumToLabel } from "@/lib/utils";
import { EmptyState } from "@/components/ui/states";

/**
 * simplified-role-workflow (continuation pass, spec item 1) - the
 * DATA_MANAGER dashboard: an operational "what needs doing today" view
 * instead of the founder-oriented KPI/analytics dashboard ADMIN still sees.
 * All data comes from the shared src/lib/todays-work.ts service and
 * src/lib/dm-dashboard-data.ts - no duplicated queries.
 */
export function DataManagerDashboard({ data, firstName }: { data: DataManagerDashboardData; firstName: string }) {
  const { todaysWork, newLeads, newLeadsCount, awaitingShortlist } = data;

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

      {/* B2 - DATA_MANAGER matches requiring attention */}
      <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#1B2430]">Matches Requiring Attention (Awaiting Shortlist)</h2>
            <p className="text-xs text-slate-500">
              {awaitingShortlist.totalCount} lead{awaitingShortlist.totalCount === 1 ? "" : "s"} with no properties shared yet &middot; oldest first
            </p>
          </div>
          <Link href="/leads?status=NEW" className="text-xs font-semibold text-[#3366FF] hover:text-[#2952CC]">
            All leads &rarr;
          </Link>
        </div>
        {awaitingShortlist.leads.length === 0 ? (
          <EmptyState title="All caught up" description="Every early-pipeline lead has already had properties shortlisted & shared." />
        ) : (
          <div className="space-y-3">
            {awaitingShortlist.leads.map((lead) => {
              const waNumber = normalizeIndianPhone(lead.phone);
              const waHref = waNumber
                ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`Hi ${lead.clientName}, checking in on your property requirement.`)}`
                : null;
              return (
                <div
                  key={lead.id}
                  className="flex flex-col gap-3 border-b border-[#EFF4FF] pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm">
                      <Link href={`/leads/${lead.id}`} className="font-semibold text-[#1B2430] hover:text-[#3366FF] transition-colors">
                        {lead.clientName}
                      </Link>{" "}
                      <span className="text-[#8A94A6]">&middot; {timeAgo(lead.createdAt)}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-[#596579]">
                      {lead.requirementType === "RENT" ? "Rent" : "Buy"} &middot; {lead.preferredBhk ? `${lead.preferredBhk} BHK` : "Any"} &middot; {lead.preferredLocation}
                      {" "}&middot; <span className="font-semibold text-[#3366FF]">{formatINR(lead.minBudget, { compact: true })} - {formatINR(lead.maxBudget, { compact: true })}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-[#8A94A6]">
                      {enumToLabel(lead.source)} &middot; {lead.assignedTo ? lead.assignedTo.name : <span className="font-semibold text-[#E6A23C]">Unassigned</span>}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Link
                      href={`/leads/${lead.id}/match`}
                      className="inline-flex items-center gap-1 rounded-xl bg-[#EFF4FF] px-2.5 py-1 text-[11px] font-semibold text-[#3366FF] hover:bg-[#DCE1FF]"
                    >
                      <Search className="h-3 w-3" /> Review Matches
                    </Link>
                    <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 rounded-xl border border-[#E7ECF2] px-2.5 py-1 text-[11px] font-semibold text-[#596579] hover:bg-[#F3F6FA]">
                      <Phone className="h-3 w-3" /> Call
                    </a>
                    {waHref && (
                      <a href={waHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl bg-[#E6F9EE] px-2.5 py-1 text-[11px] font-semibold text-[#25D366] hover:bg-[#B8F3D1]">
                        <MessageCircle className="h-3 w-3" /> WhatsApp
                      </a>
                    )}
                    <Link
                      href={`/leads/${lead.id}`}
                      className="inline-flex items-center gap-1 rounded-xl border border-[#E7ECF2] px-2.5 py-1 text-[11px] font-semibold text-[#596579] hover:bg-[#F3F6FA]"
                    >
                      <UserCog className="h-3 w-3" /> Assign
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
