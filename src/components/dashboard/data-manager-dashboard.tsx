import { getTimeBasedGreeting } from "@/lib/utils";
import { DmWorkTabs } from "./dm/dm-work-tabs";
import type { DataManagerQueues } from "@/lib/dm-queues";

/**
 * simplified-data-manager-workflow - the DATA_MANAGER daily calling
 * dashboard. Replaces the previous KPI-tile/panel layout with the 5
 * work-queue tabs the spec asks for (Today's Leads / Pending Calls /
 * Call Again / Visits-Coming / Completed) so a DM mainly processes
 * customers rather than reading CRM analytics. ADMIN and FIELD_EXECUTIVE
 * dashboards are untouched - see src/app/(app)/dashboard/page.tsx.
 */
export function DataManagerDashboard({ queues, firstName }: { queues: DataManagerQueues; firstName: string }) {
  return (
    <div className="space-y-6">
      <div className="border-b border-[#E7ECF2] pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[#1B2430]">{getTimeBasedGreeting()}{firstName ? `, ${firstName}` : ""}</h1>
        <p className="mt-1 text-sm text-[#596579]">Here&apos;s who to call today.</p>
      </div>

      <DmWorkTabs queues={queues} />
    </div>
  );
}
