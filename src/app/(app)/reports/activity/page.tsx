import { getActivityAnalytics } from "@/lib/activity-analytics-data";
import { ReportsTabs } from "@/components/dashboard/reports-tabs";
import { KpiCard } from "@/components/ui/kpi-card";
import { BarChartCard } from "@/components/dashboard/charts-dynamic";
import { Clock, CalendarClock, CheckCircle2, Target, ClipboardList, Hourglass } from "lucide-react";
import { auth } from "@/lib/auth";
import { getOrganizationId } from "@/lib/organization";

export default async function ActivityAnalyticsPage() {
  const session = await auth();
  const data = await getActivityAnalytics(getOrganizationId(session!.user));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#09090B]">Activity Analytics</h1>
        <p className="mt-1 text-sm text-[#52525B]">Response speed, success rates, and team workload</p>
      </div>

      <ReportsTabs />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Avg Response" value={data.avgResponseTimeHours !== null ? `${data.avgResponseTimeHours}h` : "—"} icon={Clock} tone="slate" />
        <KpiCard label="Avg Closing" value={data.avgClosingTimeDays !== null ? `${data.avgClosingTimeDays}d` : "—"} icon={CalendarClock} tone="slate" />
        <KpiCard label="Visit Success %" value={data.visitSuccessPct !== null ? `${data.visitSuccessPct}%` : "No data"} icon={CheckCircle2} tone="green" />
        <KpiCard label="Match Success %" value={data.propertyMatchSuccessPct !== null ? `${data.propertyMatchSuccessPct}%` : "No data"} icon={Target} tone="slate" />
        <KpiCard label="Open Follow-ups" value={data.openFollowUps} icon={ClipboardList} tone="amber" />
        <KpiCard label="Ageing (30+d)" value={data.ageingLeads.find((b) => b.bucket === "30+ days")?.count ?? 0} icon={Hourglass} tone="red" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartCard title="Employee Workload (Active Leads)" data={data.employeeWorkload.map((e) => ({ name: e.name, value: e.activeLeads }))} />
        <BarChartCard title="Lead Ageing" data={data.ageingLeads.map((b) => ({ name: b.bucket, value: b.count }))} />
      </div>
    </div>
  );
}
