import { getBrokerageAnalytics } from "@/lib/brokerage-analytics-data";
import { ReportsTabs } from "@/components/dashboard/reports-tabs";
import { KpiCard } from "@/components/ui/kpi-card";
import { BarChartCard } from "@/components/dashboard/charts-dynamic";
import { Wallet, Clock, CheckCircle2, TrendingUp } from "lucide-react";

export default async function BrokerageAnalyticsPage() {
  const data = await getBrokerageAnalytics();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#1B2430]">Brokerage Analytics</h1>
        <p className="text-sm text-[#596579]">Revenue, collections, and forecast</p>
      </div>

      <ReportsTabs />

      <p className="rounded-xl border border-dashed border-[#E7ECF2] bg-[#FAFBFC] p-3 text-xs text-[#8A94A6]">
        Deal and payment data comes from the Deals/Payments API only - there is no Deal or Deal Detail screen in the product yet, so figures here may be sparse relative to real business volume.
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard label="Total Revenue" value={`₹${data.totalRevenue.toLocaleString("en-IN")}`} icon={TrendingUp} tone="indigo" />
        <KpiCard label="Collected" value={`₹${data.collectedBrokerage.toLocaleString("en-IN")}`} icon={CheckCircle2} tone="green" />
        <KpiCard label="Pending" value={`₹${data.pendingBrokerage.toLocaleString("en-IN")}`} icon={Clock} tone="amber" />
        <KpiCard label="Expected (Open Deals)" value={`₹${data.expectedBrokerage.toLocaleString("en-IN")}`} icon={Wallet} tone="blue" />
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
