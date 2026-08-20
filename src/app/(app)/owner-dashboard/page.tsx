import { getOwnerDashboardData } from "@/lib/owner-dashboard-data";
import { KpiCard } from "@/components/ui/kpi-card";
import { Users, UserCheck, CalendarCheck, ClipboardList, Handshake, Wallet, CheckCircle2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { getOrganizationId } from "@/lib/organization";

export default async function OwnerDashboardPage() {
  const session = await auth();
  const data = await getOwnerDashboardData(getOrganizationId(session!.user));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#1B2430]">Owner Dashboard</h1>
        <p className="text-sm text-[#596579]">Executive overview of today&apos;s business and the sales funnel</p>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-[#8A94A6]">Today&apos;s Business</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          <KpiCard label="New Leads" value={data.today.newLeads} icon={Users} tone="blue" />
          <KpiCard label="Active Leads" value={data.today.activeLeads} icon={UserCheck} tone="indigo" />
          <KpiCard label="Visits Today" value={data.today.visitsToday} icon={CalendarCheck} tone="purple" />
          <KpiCard label="Follow-ups Due" value={data.today.followUpsDue} icon={ClipboardList} tone="amber" />
          <KpiCard label="Deals Closing" value={data.today.dealsClosing} icon={Handshake} tone="green" />
          <KpiCard label="Brokerage Pending" value={`₹${data.today.brokeragePending.toLocaleString("en-IN")}`} icon={Wallet} tone="amber" />
          <KpiCard label="Brokerage Received" value={`₹${data.today.brokerageReceived.toLocaleString("en-IN")}`} icon={CheckCircle2} tone="green" />
        </div>
        <p className="mt-2 text-xs text-[#8A94A6]">
          Brokerage figures come from the Payments API - there is no Deal or Payment screen in the product yet, so treat these as directional until that UI ships.
        </p>
      </div>

      <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-[#8A94A6]">Business Funnel</h2>
        <div className="space-y-2">
          {data.funnel.map((stage, i) => (
            <div key={stage.key} className="flex items-center gap-4">
              <div className="w-40 shrink-0 text-sm font-semibold text-[#1B2430]">{stage.label}</div>
              <div className="relative h-8 flex-1 rounded-lg bg-[#F3F6FA]">
                <div
                  className="flex h-8 items-center rounded-lg bg-[#3366FF] px-3 text-xs font-bold text-white transition-all"
                  style={{ width: `${Math.max(stage.conversionFromStartPct, 4)}%` }}
                >
                  {stage.count}
                </div>
              </div>
              <div className="w-24 shrink-0 text-right text-xs text-[#8A94A6]">
                {stage.conversionFromStartPct}% of leads
                {i > 0 && <div className="text-[#C3C5D8]">{stage.conversionFromPreviousPct}% of prev.</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
