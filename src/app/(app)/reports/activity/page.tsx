import { getActivityAnalytics } from "@/lib/activity-analytics-data";
import { ReportsTabs } from "@/components/dashboard/reports-tabs";
import { KpiCard } from "@/components/ui/kpi-card";
import { BarChartCard } from "@/components/dashboard/charts";
import { Clock, CalendarClock, CheckCircle2, Target, ClipboardList, Hourglass } from "lucide-react";

export default async function ActivityAnalyticsPage() {
  const data = await getActivityAnalytics();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#1B2430]">Activity Analytics</h1>
        <p className="text-sm text-[#596579]">Response speed, success rates, and workload</p>
      </div>

      <ReportsTabs />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Avg Response Time" value={data.avgResponseTimeHours !== null ? `${data.avgResponseTimeHours}h` : "—"} icon={Clock} tone="blue" />
        <KpiCard label="Avg Closing Time" value={data.avgClosingTimeDays !== null ? `${data.avgClosingTimeDays}d` : "—"} icon={CalendarClock} tone="indigo" />
        <KpiCard label="Visit Success %" value={`${data.visitSuccessPct}%`} icon={CheckCircle2} tone="green" />
        <KpiCard label="Match Success %" value={`${data.propertyMatchSuccessPct}%`} icon={Target} tone="purple" />
        <KpiCard label="Open Follow-ups" value={data.openFollowUps} icon={ClipboardList} tone="amber" />
        <KpiCard label="Ageing Leads (30+d)" value={data.ageingLeads.find((b) => b.bucket === "30+ days")?.count ?? 0} icon={Hourglass} tone="red" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartCard title="Employee Workload (Active Leads)" data={data.employeeWorkload.map((e) => ({ name: e.name, value: e.activeLeads }))} />
        <BarChartCard title="Lead Ageing" data={data.ageingLeads.map((b) => ({ name: b.bucket, value: b.count }))} />
      </div>
    </div>
  );
}
