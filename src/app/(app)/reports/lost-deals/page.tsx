import { getLostDealAnalytics } from "@/lib/lost-deal-analytics-data";
import { ReportsTabs } from "@/components/dashboard/reports-tabs";
import { KpiCard } from "@/components/ui/kpi-card";
import { BarChartCard, PieChartCard } from "@/components/dashboard/charts";
import { XCircle, AlertTriangle } from "lucide-react";

export default async function LostDealAnalysisPage() {
  const data = await getLostDealAnalytics();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#1B2430]">Lost Deal Analysis</h1>
        <p className="text-sm text-[#596579]">Why deals are lost, and where</p>
      </div>

      <ReportsTabs />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Total Lost Deals" value={data.totalLost} icon={XCircle} tone="red" />
        <KpiCard label="Uncategorized" value={data.uncategorizedCount} icon={AlertTriangle} tone="amber" hint="Missing a lost reason category" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PieChartCard title="Lost Reasons" data={data.byReason.map((r) => ({ name: r.reason, value: r.count }))} />
        <BarChartCard title="Loss Trend (last 12 months)" data={data.trend.map((t) => ({ name: t.month, value: t.count }))} />
        <BarChartCard title="Top Reasons (last 90 days)" data={data.topReasonLast90Days.map((r) => ({ name: r.reason, value: r.count }))} />
      </div>

      {data.byReason.length === 0 && (
        <p className="rounded-xl border border-dashed border-[#E7ECF2] bg-white p-4 text-sm text-[#8A94A6]">
          No lost deals with a recorded reason category yet. Mark a deal &quot;Closed Lost&quot; with a reason category to populate this report.
        </p>
      )}
    </div>
  );
}
