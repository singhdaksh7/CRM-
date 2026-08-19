"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KpiCard } from "@/components/ui/kpi-card";
import { demandPoolApi } from "@/lib/demand-pool/api";
import type { DemandAnalyticsRow, DemandPoolDashboardStats } from "@/lib/demand-pool/types";
import { Users, ListChecks, Home, Building2, KeyRound, Landmark, PhoneOff, Sparkles, Target } from "lucide-react";

export function DemandPoolDashboardCards() {
  const [stats, setStats] = useState<DemandPoolDashboardStats | null>(null);

  useEffect(() => {
    void demandPoolApi
      .getDashboardStats()
      .then((data) => setStats(data.stats))
      .catch(() => setStats(null));
  }, []);

  if (!stats) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[#8A94A6]">Demand Pool</h2>
        <Link href="/customers" className="text-xs font-semibold text-[#3366FF]">
          Open customers
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Total Customers" value={stats.totalCustomers} icon={Users} tone="blue" />
        <KpiCard label="Active Requirements" value={stats.activeRequirements} icon={ListChecks} tone="indigo" />
        <KpiCard label="Residential Demand" value={stats.residentialDemand} icon={Home} tone="green" />
        <KpiCard label="Commercial Demand" value={stats.commercialDemand} icon={Building2} tone="purple" />
        <KpiCard label="Rent Demand" value={stats.rentDemand} icon={KeyRound} tone="amber" />
        <KpiCard label="Sale Demand" value={stats.saleDemand} icon={Landmark} tone="purple" />
        <KpiCard label="Never Contacted" value={stats.neverContacted} icon={PhoneOff} tone="red" />
        <KpiCard label="New Props With Matches" value={stats.newPropertiesWithMatches} icon={Sparkles} tone="blue" />
        <KpiCard label="High Match Opportunities" value={stats.highMatchOpportunities} icon={Target} tone="green" />
      </div>
    </section>
  );
}

export function DemandAnalyticsPanel() {
  const [rows, setRows] = useState<DemandAnalyticsRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    void demandPoolApi
      .getDemandAnalytics()
      .then((data) => setRows(data.rows))
      .catch(() => setError(true));
  }, []);

  if (error || !rows) return null;

  return (
    <section className="rounded-2xl border border-[#E7ECF2] bg-white p-4 shadow-xs space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-[#1B2430]">Demand analytics</h2>
        <Link href="/reports/demand" className="text-xs font-semibold text-[#3366FF]">
          Full report
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-[#8A94A6]">
            <tr>
              <th className="py-2 pr-3">Locality</th>
              <th className="py-2 pr-3">Need</th>
              <th className="py-2 pr-3">Demand</th>
              <th className="py-2">Available</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 12).map((row, index) => (
              <tr key={`${row.locality}-${index}`} className="border-t border-[#E7ECF2]">
                <td className="py-2 pr-3 font-medium">{row.locality}</td>
                <td className="py-2 pr-3 text-[#596579]">
                  {row.assetClass === "RESIDENTIAL" && row.bhk != null ? `${row.bhk} BHK ` : ""}
                  {row.commercialSubtype ? `${row.commercialSubtype.replace(/_/g, " ")} ` : ""}
                  {row.transactionType}
                  {row.budgetBand ? ` · ${row.budgetBand}` : ""}
                </td>
                <td className="py-2 pr-3">{row.demand}</td>
                <td className="py-2">{row.available}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
