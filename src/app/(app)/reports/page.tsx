import { getReportsData } from "@/lib/reports-data";
import { getVisitAnalytics, MIN_REACTION_SAMPLE } from "@/lib/visit-analytics-data";
import { getOrganizationId } from "@/lib/organization";
import { auth } from "@/lib/auth";
import { KpiCard } from "@/components/ui/kpi-card";
import { BarChartCard, PieChartCard } from "@/components/dashboard/charts-dynamic";
import { ReportsTabs } from "@/components/dashboard/reports-tabs";
import { Badge } from "@/components/ui/badge";
import { enumToLabel } from "@/lib/utils";
import { TrendingUp, Trophy, XCircle, CalendarCheck, MapPinned, Star } from "lucide-react";

export default async function ReportsPage() {
  const session = await auth();
  const organizationId = getOrganizationId(session?.user);
  const [data, visits] = await Promise.all([getReportsData(organizationId), getVisitAnalytics(organizationId)]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#09090B]">Reports</h1>
        <p className="mt-1 text-sm text-[#52525B]">Business performance overview and conversion analytics</p>
      </div>

      <ReportsTabs />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Conversion Rate" value={`${data.conversionRate}%`} icon={TrendingUp} tone="slate" hint={`${data.totalLeads} total leads`} />
        <KpiCard label="Deals Closed" value={data.closedWon} icon={Trophy} tone="green" />
        <KpiCard label="Leads Lost" value={data.closedLost} icon={XCircle} tone="red" />
        <KpiCard label="Visits Completed" value={`${data.visitsCompleted}/${data.totalVisits}`} icon={CalendarCheck} tone="slate" />
      </div>

      {/* Visit analytics */}
      <section className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-xs space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[#71717A]">
          Visits &amp; Client Reactions <span className="font-normal text-[#A1A1AA]">(this month)</span>
        </h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard label="Visits Scheduled" value={visits.visitsScheduled} icon={CalendarCheck} tone="slate" />
          <KpiCard label="Visits Completed" value={visits.visitsCompleted} icon={Trophy} tone="green" />
          <KpiCard label="Properties Shown" value={visits.propertiesShown} icon={MapPinned} tone="slate" />
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

        <p className="text-xs text-[#52525B]">
          Average properties per visit:{" "}
          <span className="font-semibold text-[#09090B]">
            {visits.averagePropertiesPerVisit !== null ? visits.averagePropertiesPerVisit : "no visits yet"}
          </span>
          {visits.visitsCancelled > 0 && <> &middot; {visits.visitsCancelled} cancelled</>}
        </p>

        {visits.highInterestProperties.length > 0 && (
          <div className="pt-2">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#71717A]">High-interest properties</h4>
            <div className="space-y-2">
              {visits.highInterestProperties.map((p) => (
                <div key={`${p.propertyId}-${p.clientName}`} className="flex items-center justify-between gap-2 rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#09090B]">{p.title}</p>
                    <p className="text-xs text-[#71717A]">{p.area} &middot; {p.clientName}</p>
                  </div>
                  <Badge tone={p.rating === 5 ? "green" : "slate"}>{p.rating}/5 {p.label ? enumToLabel(p.label) : ""}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-2 overflow-x-auto">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#71717A]">Executive visit completion</h4>
          <table className="min-w-full divide-y divide-[#E4E4E7] text-sm">
            <thead className="bg-[#FAFAFA] text-left text-xs font-semibold uppercase tracking-wider text-[#71717A]">
              <tr>
                <th className="px-4 py-2.5">Executive</th>
                <th className="px-4 py-2.5">Assigned</th>
                <th className="px-4 py-2.5">Completed</th>
                <th className="px-4 py-2.5">Completion rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E4E7] text-[#52525B]">
              {visits.executiveCompletion.map((e) => (
                <tr key={e.id} className="hover:bg-[#FAFAFA] transition-colors">
                  <td className="px-4 py-2.5 font-semibold text-[#09090B]">{e.name}</td>
                  <td className="px-4 py-2.5">{e.assigned}</td>
                  <td className="px-4 py-2.5">{e.completed}</td>
                  <td className="px-4 py-2.5 font-semibold text-[#09090B]">
                    {e.completionRate !== null ? `${e.completionRate}%` : <span className="font-normal text-[#71717A]">No visits</span>}
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

      <div className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-xs">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#71717A]">Employee Performance</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[#E4E4E7] text-sm">
            <thead className="bg-[#FAFAFA] text-left text-xs font-semibold uppercase tracking-wider text-[#71717A]">
              <tr>
                <th className="px-4 py-2.5">Employee</th>
                <th className="px-4 py-2.5">Active Leads</th>
                <th className="px-4 py-2.5">Total Leads</th>
                <th className="px-4 py-2.5">Deals Closed</th>
                <th className="px-4 py-2.5">Total Visits</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E4E7] text-[#52525B]">
              {data.employeePerformance.map((e) => (
                <tr key={e.name} className="hover:bg-[#FAFAFA] transition-colors">
                  <td className="px-4 py-2.5 font-semibold text-[#09090B]">{e.name}</td>
                  <td className="px-4 py-2.5">{e.activeLeads}</td>
                  <td className="px-4 py-2.5">{e.totalLeads}</td>
                  <td className="px-4 py-2.5 font-semibold text-emerald-600">{e.closedWon}</td>
                  <td className="px-4 py-2.5 font-semibold text-[#09090B]">{e.totalVisits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
