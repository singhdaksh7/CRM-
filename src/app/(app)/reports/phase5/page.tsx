import { auth } from "@/lib/auth";
import { getPhase5Analytics } from "@/lib/phase5-analytics";
import { getOrganizationId } from "@/lib/organization";
import { KpiCard } from "@/components/ui/kpi-card";
import { BarChartCard, PieChartCard } from "@/components/dashboard/charts-dynamic";
import { Building2, Clock, Trophy, XCircle } from "lucide-react";

export default async function Phase5ReportsPage() {
  const session = await auth();
  const data = await getPhase5Analytics(getOrganizationId(session!.user));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Demand & Negotiation Intelligence</h1>
        <p className="text-sm text-zinc-500">Internal pipeline analytics only; no payment collection metrics.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Active Negotiations" value={data.negotiation.activeNegotiations} icon={Building2} tone="indigo" />
        <KpiCard label="Agreement Pending" value={data.negotiation.agreementPending} icon={Clock} tone="blue" />
        <KpiCard label="Won This Month" value={data.negotiation.won} icon={Trophy} tone="green" />
        <KpiCard label="Lost This Month" value={data.negotiation.lost} icon={XCircle} tone="red" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BarChartCard title="Demand by Locality" data={data.demand.byLocality} />
        <BarChartCard title="Demand by BHK" data={data.demand.byBhk} />
        <BarChartCard title="Demand by Budget" data={data.demand.byBudget} />
        <PieChartCard title="Rent vs Sale Demand" data={data.demand.rentVsSale} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
          <div className="text-2xl font-bold text-zinc-900">{data.demand.zeroInventory}</div>
          <p className="mt-1 text-xs text-zinc-500">Requirements with zero inventory</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
          <div className="text-2xl font-bold text-zinc-900">{data.demand.avgFirstMatchDays} days</div>
          <p className="mt-1 text-xs text-zinc-500">Average time to first match</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
          <div className="text-2xl font-bold text-zinc-900">₹{data.negotiation.expectedBrokeragePipeline.toLocaleString("en-IN")}</div>
          <p className="mt-1 text-xs text-zinc-500">Expected brokerage pipeline</p>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
        <h2 className="text-base font-semibold text-zinc-900">Demand / Supply Gap</h2>
        <div className="mt-3 space-y-2">
          {data.demand.demandSupplyGap.map((g) => (
            <p className="text-sm text-zinc-700" key={g.locality}>
              <span className="font-medium text-zinc-900">{g.locality}</span>: {g.demand} requirements / {g.supply} properties ·{" "}
              <b className="font-semibold text-zinc-900">{g.level}</b>
            </p>
          ))}
          {data.demand.demandSupplyGap.length === 0 && <p className="text-sm text-zinc-500">No gap data available.</p>}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs">
        <h2 className="text-base font-semibold text-zinc-900">Negotiation Summary</h2>
        <div className="mt-3 space-y-1.5 text-sm text-zinc-700">
          <p>
            Stale: <span className="font-semibold text-zinc-900">{data.negotiation.staleNegotiations}</span> · Win/loss ratio:{" "}
            <span className="font-semibold text-zinc-900">{data.negotiation.winLossRatio}%</span> · Avg duration:{" "}
            <span className="font-semibold text-zinc-900">{data.negotiation.avgNegotiationDays} days</span>
          </p>
          <p>
            Direct: <span className="font-semibold text-zinc-900">{data.negotiation.directCount}</span> · Indirect:{" "}
            <span className="font-semibold text-zinc-900">{data.negotiation.indirectCount}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
