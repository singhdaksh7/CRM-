import { getLostDealAnalytics } from "@/lib/lost-deal-analytics-data";
import { ReportsTabs } from "@/components/dashboard/reports-tabs";
import { KpiCard } from "@/components/ui/kpi-card";
import { BarChartCard, PieChartCard } from "@/components/dashboard/charts-dynamic";
import { XCircle, AlertTriangle } from "lucide-react";
import { auth } from "@/lib/auth";
import { getOrganizationId } from "@/lib/organization";

export default async function LostDealAnalysisPage() {
  const session = await auth();
  const data = await getLostDealAnalytics(getOrganizationId(session!.user));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#09090B]">Lost Deal Analysis</h1>
        <p className="mt-1 text-sm text-[#52525B]">Root cause analysis and loss trends</p>
      </div>

      <ReportsTabs />

      {data.migrationPending ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          This report needs the Phase 3 database migration (adds Deal.lostReasonCategory), which has not been applied to this database yet.
        </p>
      ) : (
        <>
          <p className="rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] p-3 text-xs text-[#71717A]">
            Deal data comes from the Deals API only.
          </p>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard label="Total Lost Deals" value={data.totalLost} icon={XCircle} tone="red" />
            <KpiCard label="Uncategorized" value={data.uncategorizedCount} icon={AlertTriangle} tone="amber" hint="Missing reason category" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PieChartCard title="Lost Reasons" data={data.byReason.map((r) => ({ name: r.reason, value: r.count }))} semantic />
            <BarChartCard title="Loss Trend (last 12 months)" data={data.trend.map((t) => ({ name: t.month, value: t.count }))} />
            <BarChartCard title="Top Reasons (last 90 days)" data={data.topReasonLast90Days.map((r) => ({ name: r.reason, value: r.count }))} semantic />
          </div>

          {data.byReason.length === 0 && (
            <p className="rounded-lg border border-[#E4E4E7] bg-white p-4 text-sm text-[#71717A]">
              No lost deals with a recorded reason category yet.
            </p>
          )}
        </>
      )}
    </div>
  );
}
