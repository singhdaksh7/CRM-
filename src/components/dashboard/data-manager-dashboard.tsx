import { getTimeBasedGreeting } from "@/lib/utils";
import { DmWorkTabs } from "./dm/dm-work-tabs";
import type { DataManagerQueues } from "@/lib/dm-queues";

export function DataManagerDashboard({ queues, firstName }: { queues: DataManagerQueues; firstName: string }) {
  return (
    <div className="space-y-6">
      <div className="border-b border-[#E4E4E7] pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[#09090B]">{getTimeBasedGreeting()}{firstName ? `, ${firstName}` : ""}</h1>
        <p className="mt-1 text-xs text-[#71717A]">Here&apos;s who to call today.</p>
      </div>

      <DmWorkTabs queues={queues} />
    </div>
  );
}
