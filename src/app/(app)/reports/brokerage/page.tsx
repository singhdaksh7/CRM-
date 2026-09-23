import { getBrokerageAnalytics } from "@/lib/brokerage-analytics-data";
import { ReportsTabs } from "@/components/dashboard/reports-tabs";
import { KpiCard } from "@/components/ui/kpi-card";
import { BarChartCard } from "@/components/dashboard/charts-dynamic";
import { Wallet, Clock, CheckCircle2, TrendingUp } from "lucide-react";
import { auth } from "@/lib/auth";
import { getOrganizationId } from "@/lib/organization";

export default async function BrokerageAnalyticsPage() {
  const session = await auth();
  const data = await getBrokerageAnalytics(getOrganizationId(session!.user));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#09090B]">Brokerage Analytics</h1>
        <p className="mt-1 text-sm text-[#52525B]">Revenue, collections, and commission forecasts</p>
      </div>

      <ReportsTabs />

      <p className="rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] p-3 text-xs text-[#71717A]">
        Deal and payment data comes from the Deals/Payments API only.
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Total Revenue" value={`₹${data.totalRevenue.toLocaleString("en-IN")}`} icon={TrendingUp} tone="slate" />
        <KpiCard label="Collected" value={`₹${data.collectedBrokerage.toLocaleString("en-IN")}`} icon={CheckCircle2} tone="green" />
        <KpiCard label="Pending" value={`₹${data.pendingBrokerage.toLocaleString("en-IN")}`} icon={Clock} tone="amber" />
        <KpiCard label="Expected (Open Deals)" value={`₹${data.expectedBrokerage.toLocaleString("en-IN")}`} icon={Wallet} tone="slate" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartCard title="Monthly Collected Brokerage" data={data.monthly.map((m) => ({ name: m.month, value: m.collected }))} />
        <BarChartCard title="Quarterly Collected Brokerage" data={data.quarterly.map((q) => ({ name: q.quarter, value: q.collected }))} />
        <BarChartCard title="Yearly Collected Brokerage" data={data.yearly.map((y) => ({ name: y.year, value: y.collected }))} />
        <BarChartCard title="Brokerage by Employee" data={data.byEmployee.map((e) => ({ name: e.name, value: e.collected }))} />
      </div>
    </div>
  );
}
