import { getReportsData } from "@/lib/reports-data";
import { getVisitAnalytics, MIN_REACTION_SAMPLE } from "@/lib/visit-analytics-data";
import { getOrganizationId } from "@/lib/organization";
import { auth } from "@/lib/auth";
import { KpiCard } from "@/components/ui/kpi-card";
import { BarChartCard, PieChartCard } from "@/components/dashboard/charts";
import { ReportsTabs } from "@/components/dashboard/reports-tabs";
import { Badge } from "@/components/ui/badge";
import { enumToLabel } from "@/lib/utils";
import { TrendingUp, Trophy, XCircle, CalendarCheck, MapPinned, Star } from "lucide-react";

export default async function ReportsPage() {
  const session = await auth();
  const [data, visits] = await Promise.all([getReportsData(), getVisitAnalytics(getOrganizationId(session?.user.id))]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#1B2430]">Reports</h1>
        <p className="text-sm text-[#596579]">Business performance overview</p>
      </div>

      <ReportsTabs />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Conversion Rate" value={`${data.conversionRate}%`} icon={TrendingUp} tone="indigo" hint={`${data.totalLeads} total leads`} />
        <KpiCard label="Deals Closed" value={data.closedWon} icon={Trophy} tone="green" />
        <KpiCard label="Leads Lost" value={data.closedLost} icon={XCircle} tone="red" />
        <KpiCard label="Visits Completed" value={`${data.visitsCompleted}/${data.totalVisits}`} icon={CalendarCheck} tone="blue" />
      </div>

      {/* Visit analytics. Every rate/average is null-guarded rather than
          rendering a misleading 0% or a confident average from a tiny sample. */}
      <section className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs">
        <h3 className="mb-3 text-sm font-bold text-[#1B2430]">Visits &amp; Client Reactions <span className="font-normal text-[#8A94A6]">(this month)</span></h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard label="Visits Scheduled" value={visits.visitsScheduled} icon={CalendarCheck} tone="blue" />
          <KpiCard label="Visits Completed" value={visits.visitsCompleted} icon={Trophy} tone="green" />
          <KpiCard label="Properties Shown" value={visits.propertiesShown} icon={MapPinned} tone="indigo" />
          <KpiCard
            label="Avg Reaction"
            value={visits.averageReactionScore !== null ? `${visits.averageReactionScore}/5` : "—"}
            icon={Star}
            tone="amber"
            hint={
              visits.averageReactionScore !== null
                ? `${visits.reactionSampleSize} rated properties`
                : `Needs ${MIN_REACTION_SAMPLE}+ rated properties (have ${visits.reactionSampleSize})`
            }
          />
        </div>

        <p className="mt-3 text-xs text-[#596579]">
          Average properties per visit:{" "}
          <span className="font-semibold text-[#1B2430]">
            {visits.averagePropertiesPerVisit !== null ? visits.averagePropertiesPerVisit : "no visits yet"}
          </span>
          {visits.visitsCancelled > 0 && <> &middot; {visits.visitsCancelled} cancelled</>}
        </p>

        {visits.highInterestProperties.length > 0 && (
          <div className="mt-4">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#8A94A6]">High-interest properties</h4>
            <div className="space-y-1.5">
              {visits.highInterestProperties.map((p) => (
                <div key={`${p.propertyId}-${p.clientName}`} className="flex items-center justify-between gap-2 rounded-xl border border-[#E7ECF2] bg-[#FAFBFC] px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#1B2430]">{p.title}</p>
                    <p className="text-xs text-[#8A94A6]">{p.area} &middot; {p.clientName}</p>
                  </div>
                  <Badge tone={p.rating === 5 ? "green" : "blue"}>{p.rating}/5 {p.label ? enumToLabel(p.label) : ""}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#8A94A6]">Executive visit completion</h4>
          <table className="min-w-full divide-y divide-[#E7ECF2] text-sm">
            <thead className="bg-[#FAFBFC] text-left text-xs font-semibold uppercase tracking-wider text-[#8A94A6]">
              <tr>
                <th className="px-4 py-2.5">Executive</th>
                <th className="px-4 py-2.5">Assigned</th>
                <th className="px-4 py-2.5">Completed</th>
                <th className="px-4 py-2.5">Completion rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFF4FF] text-[#596579]">
              {visits.executiveCompletion.map((e) => (
                <tr key={e.id} className="hover:bg-[#F3F6FA]">
                  <td className="px-4 py-2.5 font-bold text-[#1B2430]">{e.name}</td>
                  <td className="px-4 py-2.5">{e.assigned}</td>
                  <td className="px-4 py-2.5">{e.completed}</td>
                  <td className="px-4 py-2.5 font-semibold text-[#3366FF]">
                    {e.completionRate !== null ? `${e.completionRate}%` : <span className="font-normal text-[#8A94A6]">No visits</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PieChartCard title="Leads by Source" data={data.leadsBySource} />
        <PieChartCard title="Rent vs Buy Enquiries" data={data.rentVsSale} />
        <BarChartCard title="Property Demand by Location" data={data.propertiesByLocation} />
        <BarChartCard title="Property Demand by Budget" data={data.propertyDemandByBudget.map((b) => ({ name: b.label, value: b.count }))} />
      </div>

      <div className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs">
        <h3 className="mb-3 text-sm font-bold text-[#1B2430]">Employee Performance</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[#E7ECF2] text-sm">
            <thead className="bg-[#FAFBFC] text-left text-xs font-semibold uppercase tracking-wider text-[#8A94A6]">
              <tr>
                <th className="px-4 py-2.5">Employee</th>
                <th className="px-4 py-2.5">Active Leads</th>
                <th className="px-4 py-2.5">Total Leads</th>
                <th className="px-4 py-2.5">Deals Closed</th>
                <th className="px-4 py-2.5">Total Visits</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFF4FF] text-[#596579]">
              {data.employeePerformance.map((e) => (
                <tr key={e.name} className="hover:bg-[#F3F6FA]">
                  <td className="px-4 py-2.5 font-bold text-[#1B2430]">{e.name}</td>
                  <td className="px-4 py-2.5">{e.activeLeads}</td>
                  <td className="px-4 py-2.5">{e.totalLeads}</td>
                  <td className="px-4 py-2.5 font-semibold text-[#1FA971]">{e.closedWon}</td>
                  <td className="px-4 py-2.5 font-semibold text-[#3366FF]">{e.totalVisits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
