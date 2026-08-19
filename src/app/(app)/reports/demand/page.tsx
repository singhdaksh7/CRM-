import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DemandAnalyticsPanel } from "@/components/customers/demand-dashboard-cards";

export default async function DemandReportPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "DATA_MANAGER") redirect("/reports");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[#1B2430]">Demand Analytics</h1>
        <p className="text-sm text-[#596579]">Supply vs demand by locality, BHK, asset class, and transaction type.</p>
      </div>
      <DemandAnalyticsPanel />
    </div>
  );
}
