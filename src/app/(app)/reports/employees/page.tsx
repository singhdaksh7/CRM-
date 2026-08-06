import Link from "next/link";
import { getEmployeePerformance, type LeaderboardPeriod } from "@/lib/employee-performance-data";
import { ReportsTabs } from "@/components/dashboard/reports-tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Download } from "lucide-react";

const PERIODS: { key: LeaderboardPeriod; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

export default async function EmployeePerformancePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period: periodParam } = await searchParams;
  const period = (PERIODS.some((p) => p.key === periodParam) ? periodParam : "monthly") as LeaderboardPeriod;
  const employees = await getEmployeePerformance(period);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#1B2430]">Employee Performance</h1>
          <p className="text-sm text-[#596579]">KPIs and leaderboard for the field team</p>
        </div>
        <a href={`/api/reports/export?type=employees`} className="flex items-center gap-1.5 rounded-lg border border-[#E7ECF2] bg-white px-3 py-1.5 text-xs font-semibold text-[#596579] hover:bg-[#F3F6FA]">
          <Download className="h-3.5 w-3.5" /> Export CSV
        </a>
      </div>

      <ReportsTabs />

      <div className="flex gap-1.5">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={`/reports/employees?period=${p.key}`}
            className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", period === p.key ? "bg-[#1B2430] text-white" : "bg-white border border-[#E7ECF2] text-[#596579] hover:bg-[#F3F6FA]")}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border border-[#E7ECF2] bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[#E7ECF2] text-sm">
            <thead className="bg-[#FAFBFC] text-left text-xs font-semibold uppercase tracking-wider text-[#8A94A6]">
              <tr>
                <th className="px-4 py-2.5">Rank</th>
                <th className="px-4 py-2.5">Employee</th>
                <th className="px-4 py-2.5">Assigned</th>
                <th className="px-4 py-2.5">Contacted</th>
                <th className="px-4 py-2.5">Follow-ups</th>
                <th className="px-4 py-2.5">Visits</th>
                <th className="px-4 py-2.5">Deals Closed</th>
                <th className="px-4 py-2.5">Conversion %</th>
                <th className="px-4 py-2.5">Brokerage</th>
                <th className="px-4 py-2.5">Avg Response</th>
                <th className="px-4 py-2.5">Avg Lead Age</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFF4FF] text-[#596579]">
              {employees.map((e, i) => (
                <tr key={e.id} className="hover:bg-[#F3F6FA]">
                  <td className="px-4 py-2.5 font-bold text-[#1B2430]">
                    {i === 0 ? <Badge tone="green">#1</Badge> : `#${i + 1}`}
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-[#1B2430]">{e.name}</td>
                  <td className="px-4 py-2.5">{e.assignedLeads}</td>
                  <td className="px-4 py-2.5">{e.contacted}</td>
                  <td className="px-4 py-2.5">{e.followUps}</td>
                  <td className="px-4 py-2.5">{e.visits}</td>
                  <td className="px-4 py-2.5 font-semibold text-[#1FA971]">{e.dealsClosed}</td>
                  <td className="px-4 py-2.5">{e.conversionPct !== null ? `${e.conversionPct}%` : <span className="text-[#8A94A6]">Insufficient data</span>}</td>
                  <td className="px-4 py-2.5">₹{e.brokerageGenerated.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-2.5">{e.avgResponseTimeHours !== null ? `${e.avgResponseTimeHours}h` : "—"}</td>
                  <td className="px-4 py-2.5">{e.avgLeadAgeDays}d</td>
                </tr>
              ))}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-6 text-center text-sm text-[#8A94A6]">No field executives yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
