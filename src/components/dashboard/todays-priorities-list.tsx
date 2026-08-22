"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { PhoneCall, MessageCircle, CalendarClock, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { TodaysWorkItem, TodaysWorkKind } from "@/lib/todays-work";

const KIND_LABEL: Record<TodaysWorkKind, string> = {
  CALL_TODAY: "Call Today",
  WHATSAPP_TODAY: "WhatsApp Today",
  VISIT_EXPECTED_TODAY: "Customer Expected",
  GENERAL_FOLLOW_UP_TODAY: "Follow-up",
  VISIT_TODAY: "Visit",
  OVERDUE: "Overdue",
};

const KIND_ICON: Record<TodaysWorkKind, React.ComponentType<{ className?: string }>> = {
  CALL_TODAY: PhoneCall,
  WHATSAPP_TODAY: MessageCircle,
  VISIT_EXPECTED_TODAY: Clock,
  GENERAL_FOLLOW_UP_TODAY: Clock,
  VISIT_TODAY: CalendarClock,
  OVERDUE: AlertTriangle,
};

const KIND_TONE: Record<TodaysWorkKind, "blue" | "green" | "amber" | "red" | "purple" | "slate"> = {
  CALL_TODAY: "blue",
  WHATSAPP_TODAY: "green",
  VISIT_EXPECTED_TODAY: "purple",
  GENERAL_FOLLOW_UP_TODAY: "slate",
  VISIT_TODAY: "blue",
  OVERDUE: "red",
};

/**
 * simplified-role-workflow (continuation pass, spec item 1) - the
 * chronological "Today's Priorities" list shared by the DATA_MANAGER
 * dashboard. Each row's inline action hits the SAME routes the lead
 * workspace / visit detail page already use (PATCH /api/follow-ups/[id],
 * PATCH /api/visits/[id]) - no new business logic, just a quicker surface
 * for it. [Reschedule] deliberately links out to the visit detail page
 * rather than duplicating its reschedule form here.
 */
export function TodaysPrioritiesList({ items }: { items: TodaysWorkItem[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function completeFollowUp(item: TodaysWorkItem) {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/follow-ups/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to complete");
      toast.success("Marked complete");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmVisit(item: TodaysWorkItem) {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/visits/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CONFIRMED" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to confirm");
      toast.success("Visit confirmed");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-[#8A94A6]">Nothing on today&apos;s plate. Great work!</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const Icon = KIND_ICON[item.kind];
        const isVisit = item.kind === "VISIT_TODAY";
        const busy = busyId === item.id;
        return (
          <div key={`${item.kind}-${item.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E7ECF2] bg-white p-3 shadow-xs">
            <div className="flex min-w-0 items-start gap-2.5">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#596579]" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#1B2430]">
                  {item.leadName}
                  {isVisit && item.propertyCount ? ` · ${item.propertyCount} ${item.propertyCount === 1 ? "property" : "properties"}` : ""}
                </p>
                <p className="text-xs text-[#8A94A6]">
                  {isVisit ? item.visitTime : formatDateTime(item.dueAt)}
                  {item.ownerName ? ` · ${item.ownerName}` : ""}
                  {isVisit && item.meetingLocation ? ` · ${item.meetingLocation}` : ""}
                  {item.note ? ` · ${item.note}` : ""}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge tone={KIND_TONE[item.kind]}>{KIND_LABEL[item.kind]}</Badge>
              {isVisit ? (
                <>
                  <Link href={`/visits/${item.id}`} className="rounded-lg border border-[#E7ECF2] px-2.5 py-1.5 text-xs font-semibold text-[#3366FF] hover:bg-[#F3F6FA]">
                    Open Visit
                  </Link>
                  <button onClick={() => confirmVisit(item)} disabled={busy} className="rounded-lg border border-[#E7ECF2] px-2.5 py-1.5 text-xs font-semibold text-[#1FA971] hover:bg-[#F3F6FA] disabled:opacity-50">
                    Confirm
                  </button>
                  <Link href={`/visits/${item.id}`} className="rounded-lg border border-[#E7ECF2] px-2.5 py-1.5 text-xs font-semibold text-[#596579] hover:bg-[#F3F6FA]">
                    Reschedule
                  </Link>
                </>
              ) : (
                <>
                  {item.leadId && (
                    <Link href={`/leads/${item.leadId}`} className="rounded-lg border border-[#E7ECF2] px-2.5 py-1.5 text-xs font-semibold text-[#3366FF] hover:bg-[#F3F6FA]">
                      Open Lead
                    </Link>
                  )}
                  <button onClick={() => completeFollowUp(item)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-[#1FA971] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#178A5C] disabled:opacity-50">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
