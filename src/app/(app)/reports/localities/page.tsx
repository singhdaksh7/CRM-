import { getLocalityAnalytics } from "@/lib/locality-analytics-data";
import { ReportsTabs } from "@/components/dashboard/reports-tabs";
import { BarChartCard, PieChartCard } from "@/components/dashboard/charts-dynamic";
import { auth } from "@/lib/auth";
import { getOrganizationId } from "@/lib/organization";

export default async function LocalityAnalyticsPage() {
  const session = await auth();
  const data = await getLocalityAnalytics(getOrganizationId(session!.user));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#09090B]">Locality Analytics</h1>
        <p className="mt-1 text-sm text-[#52525B]">Demand distribution, buyer budgets, and inventory supply by locality</p>
      </div>

      <ReportsTabs />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartCard title="Most Requested Localities" data={data.mostRequested.map((l) => ({ name: l.locality, value: l.requestedCount }))} />
        <BarChartCard title="Highest Budget Areas" data={data.highestBudget.map((l) => ({ name: l.locality, value: l.avgBudget }))} />
        <BarChartCard title="Fastest Selling Areas (avg days)" data={data.fastestSelling.map((l) => ({ name: l.locality, value: l.avgDaysToSell ?? 0 }))} />
        <BarChartCard title="Inventory by BHK" data={data.inventoryByBhk.map((b) => ({ name: `${b.bhk} BHK`, value: b.count }))} />
        <BarChartCard title="Inventory by Budget" data={data.inventoryByBudgetBucket.map((b) => ({ name: b.label, value: b.count }))} />
        <PieChartCard title="Inventory: Rent vs Sale" data={data.inventoryRentVsSale} />
      </div>

      <div className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-xs">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#71717A]">Locality Detail</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[#E4E4E7] text-sm">
            <thead className="bg-[#FAFAFA] text-left text-xs font-semibold uppercase tracking-wider text-[#71717A]">
              <tr>
                <th className="px-4 py-2.5">Locality</th>
                <th className="px-4 py-2.5">Requested</th>
                <th className="px-4 py-2.5">Avg Budget</th>
                <th className="px-4 py-2.5">Available Inventory</th>
                <th className="px-4 py-2.5">Avg Days to Sell</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E4E7] text-[#52525B]">
              {data.mostRequested.map((l) => (
                <tr key={l.locality} className="hover:bg-[#FAFAFA] transition-colors">
                  <td className="px-4 py-2.5 font-semibold text-[#09090B]">{l.locality}</td>
                  <td className="px-4 py-2.5">{l.requestedCount}</td>
                  <td className="px-4 py-2.5">₹{l.avgBudget.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-2.5">{l.availableInventory}</td>
                  <td className="px-4 py-2.5">{l.avgDaysToSell !== null ? `${l.avgDaysToSell}d` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
