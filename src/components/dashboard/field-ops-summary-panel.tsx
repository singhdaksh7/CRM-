import Link from "next/link";
import { KpiCard } from "@/components/ui/kpi-card";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, CheckCircle2, Clock, ShieldAlert, FileWarning, Building2, Handshake, Trophy, Building, RefreshCw } from "lucide-react";
import type { FieldOpsSummary } from "@/lib/field-ops-summary-data";

const FRESHNESS_TONE: Record<string, "green" | "blue" | "amber" | "red"> = {
  FRESH: "green",
  VERIFIED: "blue",
  NEEDS_VERIFICATION: "amber",
  STALE: "red",
};

/** Objective 12 - Manager Dashboard widgets (ADMIN/DATA_MANAGER only). */
export function FieldOpsSummaryPanel({ summary }: { summary: FieldOpsSummary }) {
  const needsVerification = summary.freshness.find((f) => f.label === "NEEDS_VERIFICATION")?.count ?? 0;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-[#1B2430]">Field Operations</h2>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <KpiCard label="Today's Visits" value={summary.todaysVisitCount} icon={CalendarClock} tone="blue" />
        <KpiCard label="Completed Visits" value={summary.completedVisitCount} icon={CheckCircle2} tone="green" />
        <KpiCard label="Pending Visits" value={summary.pendingVisitCount} icon={Clock} tone="amber" />
        <Link href="/admin/property-issues">
          <KpiCard label="Pending Verification" value={summary.pendingVerificationCount} icon={ShieldAlert} tone="red" />
        </Link>
        <Link href="/admin/property-issues">
          <KpiCard label="Unavailable Reports" value={summary.unavailableReportsCount} icon={FileWarning} tone="amber" />
        </Link>
        <KpiCard label="Direct Inventory" value={summary.directInventoryCount} icon={Building2} tone="indigo" />
        <KpiCard label="Indirect Inventory" value={summary.indirectInventoryCount} icon={Handshake} tone="purple" />
        <KpiCard label="Inactive Inventory" value={summary.inactiveInventoryCount} icon={Building} tone="red" />
        <KpiCard label="Properties Awaiting Update" value={summary.propertiesAwaitingUpdateCount} icon={RefreshCw} tone="amber" />
        {needsVerification > 0 && (
          <KpiCard label="Need Verification (Freshness)" value={needsVerification} icon={ShieldAlert} tone="amber" />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#1B2430]">
            <Trophy className="h-4 w-4 text-[#3366FF]" /> Top Performing Executive
          </h3>
          {summary.topPerformingExecutive ? (
            <p className="text-sm text-[#1B2430]">
              <span className="font-semibold">{summary.topPerformingExecutive.name}</span> - {summary.topPerformingExecutive.dealsClosed} deal{summary.topPerformingExecutive.dealsClosed === 1 ? "" : "s"} closed this month
            </p>
          ) : (
            <p className="text-sm text-[#8A94A6]">Insufficient data this month.</p>
          )}
        </div>

        <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-[#1B2430]">Executive Live Status</h3>
          {summary.executiveLiveStatus.length === 0 ? (
            <p className="text-sm text-[#8A94A6]">No field executives yet.</p>
          ) : (
            <ul className="space-y-2">
              {summary.executiveLiveStatus.map((e) => (
                <li key={e.id} className="flex items-center justify-between text-sm">
                  <span className="text-[#1B2430]">{e.name}</span>
                  <span className="text-[#596579]">{e.completedToday}/{e.todaysVisits} visits done today</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {summary.freshness.length > 0 && (
        <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-[#1B2430]">Inventory Freshness</h3>
          <div className="flex flex-wrap gap-3">
            {summary.freshness.map((f) => (
              <Badge key={f.label} tone={FRESHNESS_TONE[f.label] ?? "slate"}>{f.label.replace(/_/g, " ")}: {f.count}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
