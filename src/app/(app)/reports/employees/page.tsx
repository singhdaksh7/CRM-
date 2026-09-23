import Link from "next/link";
import { getEmployeePerformance, type LeaderboardPeriod } from "@/lib/employee-performance-data";
import { ReportsTabs } from "@/components/dashboard/reports-tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Download } from "lucide-react";
import { auth } from "@/lib/auth";
import { getOrganizationId } from "@/lib/organization";

const PERIODS: { key: LeaderboardPeriod; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

export default async function EmployeePerformancePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period: periodParam } = await searchParams;
  const period = (PERIODS.some((p) => p.key === periodParam) ? periodParam : "monthly") as LeaderboardPeriod;
  const session = await auth();
  const employees = await getEmployeePerformance(period, getOrganizationId(session!.user));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#09090B]">Employee Performance</h1>
          <p className="mt-1 text-sm text-[#52525B]">KPIs and leaderboard for the field operations team</p>
        </div>
        <a
          href={`/api/reports/export?type=employees`}
          className="flex items-center gap-1.5 rounded-lg border border-[#E4E4E7] bg-white px-3 py-1.5 text-xs font-semibold text-[#09090B] hover:bg-[#F4F4F5] transition-colors"
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </a>
      </div>

      <ReportsTabs />

      <div className="flex gap-1.5">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={`/reports/employees?period=${p.key}`}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors",
              period === p.key
                ? "bg-[#0A0A0A] text-white"
                : "bg-white border border-[#E4E4E7] text-[#52525B] hover:bg-[#F4F4F5] hover:text-[#09090B]"
            )}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-[#E4E4E7] bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[#E4E4E7] text-sm">
            <thead className="bg-[#FAFAFA] text-left text-xs font-semibold uppercase tracking-wider text-[#71717A]">
              <tr>
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Assigned</th>
                <th className="px-4 py-3">Contacted</th>
                <th className="px-4 py-3">Follow-ups</th>
                <th className="px-4 py-3">Visits</th>
                <th className="px-4 py-3">Deals Closed</th>
                <th className="px-4 py-3">Conversion %</th>
                <th className="px-4 py-3">Brokerage</th>
                <th className="px-4 py-3">Avg Response</th>
                <th className="px-4 py-3">Avg Lead Age</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E4E7] text-[#52525B]">
              {employees.map((e, i) => (
                <tr key={e.id} className="hover:bg-[#FAFAFA] transition-colors">
                  <td className="px-4 py-3 font-bold text-[#09090B]">
                    {i === 0 ? <Badge tone="green">#1</Badge> : `#${i + 1}`}
                  </td>
                  <td className="px-4 py-3 font-semibold text-[#09090B]">{e.name}</td>
                  <td className="px-4 py-3">{e.assignedLeads}</td>
                  <td className="px-4 py-3">{e.contacted}</td>
                  <td className="px-4 py-3">{e.followUps}</td>
                  <td className="px-4 py-3 font-medium text-[#09090B]">{e.visits}</td>
                  <td className="px-4 py-3 font-semibold text-emerald-600">{e.dealsClosed}</td>
                  <td className="px-4 py-3">{e.conversionPct !== null ? `${e.conversionPct}%` : <span className="text-[#71717A]">No data</span>}</td>
                  <td className="px-4 py-3 font-medium text-[#09090B]">₹{e.brokerageGenerated.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3">{e.avgResponseTimeHours !== null ? `${e.avgResponseTimeHours}h` : "—"}</td>
                  <td className="px-4 py-3">{e.avgLeadAgeDays}d</td>
                </tr>
              ))}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-6 text-center text-sm text-[#71717A]">No field executives found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
