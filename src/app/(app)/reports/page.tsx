import { getReportsData } from "@/lib/reports-data";
import { KpiCard } from "@/components/ui/kpi-card";
import { BarChartCard, PieChartCard } from "@/components/dashboard/charts";
import { TrendingUp, Trophy, XCircle, CalendarCheck } from "lucide-react";

export default async function ReportsPage() {
  const data = await getReportsData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#1B2430]">Reports</h1>
        <p className="text-sm text-[#596579]">Business performance overview</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Conversion Rate" value={`${data.conversionRate}%`} icon={TrendingUp} tone="indigo" hint={`${data.totalLeads} total leads`} />
        <KpiCard label="Deals Closed" value={data.closedWon} icon={Trophy} tone="green" />
        <KpiCard label="Leads Lost" value={data.closedLost} icon={XCircle} tone="red" />
        <KpiCard label="Visits Completed" value={`${data.visitsCompleted}/${data.totalVisits}`} icon={CalendarCheck} tone="blue" />
      </div>

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
